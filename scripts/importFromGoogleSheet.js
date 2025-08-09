const { google } = require("googleapis");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const cloudinary = require("cloudinary").v2;
require("dotenv").config();
const Pet = require("../models/pet");

/* ===== Config ===== */
const DRIVE_LIST_PAGESIZE = Number(process.env.DRIVE_LIST_PAGESIZE || "1000");
const DRIVE_RECURSIVE = Number(process.env.DRIVE_RECURSIVE || "1"); // 1=bật đệ quy thư mục con

/* ===== Telegram ===== */
const _fetch =
  typeof fetch === "function"
    ? fetch
    : (...args) => import("node-fetch").then((m) => m.default(...args));

async function tgSend(text, opts = {}) {
  const token = process.env.TG_BOT_TOKEN;
  const chatId = process.env.TG_CHAT_ID;
  if (!token || !chatId || !text) return;
  try {
    const payload = {
      chat_id: chatId,
      text,
      disable_notification: !!Number(process.env.TG_SILENT || 0),
      parse_mode: "Markdown",
      ...opts,
    };
    const res = await _fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) console.warn("TG send failed:", await res.text());
  } catch (e) {
    console.warn("TG error:", e.message);
  }
}

function tgChunkAndSend(prefix, text) {
  const MAX = 3500; // < 4096
  if (!text) return;
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX)
    chunks.push(text.slice(i, i + MAX));
  return Promise.all(
    chunks.map((c, idx) =>
      tgSend(
        `${prefix}${idx ? ` (part ${idx + 1})` : ""}\n\`\`\`\n${c}\n\`\`\``
      )
    )
  );
}

/* ===== Logging -> file ===== */
function logLine(prefix, message) {
  const logDir = path.join(__dirname, "../logs");
  const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const logFile = path.join(logDir, `import-log-${dateStr}.log`);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(
    logFile,
    `[${new Date().toISOString()}] ${prefix} ${message}\n`
  );
}
const logError = (m) => logLine("❌", m);
const logSuccess = (m) => logLine("✅", m);
const logInfo = (m) => logLine("ℹ️", m);

/* ===== Helpers ===== */
const normalizeCode = (v) => (v == null ? "" : String(v).trim().toUpperCase());
const stripExt = (name = "") => {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
};
const squashNonAlnum = (s = "") => s.replace(/[^0-9a-z]/gi, "");

/* Làm sạch tên file để match robust */
function removeZeroWidth(str = "") {
  // loại U+200B..U+200D, U+FEFF
  return str.replace(/[\u200B-\u200D\uFEFF]/g, "");
}
function normalizeForMatch(name = "") {
  // 1) NFC; 2) bỏ ký tự vô hình; 3) trim; 4) upper; 5) bỏ ký tự lạ (giữ A-Z0-9._)
  const s = removeZeroWidth(String(name).normalize("NFC"))
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._]/g, "");
  return s;
}
function baseNameUpper(name = "") {
  return stripExt(normalizeForMatch(name));
}
function baseNameSquashed(name = "") {
  return squashNonAlnum(baseNameUpper(name));
}

/* ===== Image type allow-list ===== */
const IMAGE_MIME_ALLOW = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/heif-sequence",
  "image/heic-sequence",
]);
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

function isLikelyImageFile(f) {
  const mime = String(f.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true; // bắt mọi image/*
  if (IMAGE_MIME_ALLOW.has(mime)) return true;
  if (f.name && IMAGE_EXT_RE.test(f.name)) return true; // fallback theo đuôi
  return false;
}

function parseDateFlexible(v) {
  if (!v && v !== 0) return null;
  if (typeof v === "string" && v.includes("/")) {
    const [d, m, y] = v.split("/").map((n) => parseInt(n, 10));
    if (!d || !m || !y) return null;
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  }
  if (typeof v === "number" && !Number.isNaN(v)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + v * 86400000);
  }
  return null;
}

/* ===== Cloudinary ===== */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ===== Google Drive (Service Account key file) ===== */
let _drive;
async function getDrive() {
  if (_drive) return _drive;
  const keyPathEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPathEnv) throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not set");
  const keyPath = path.resolve(keyPathEnv);
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Service account key file not found at ${keyPath}`);
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  const client = await auth.getClient();
  _drive = google.drive({ version: "v3", auth: client });
  return _drive;
}

async function resolveShortcutId(id, drive) {
  const meta = await drive.files.get({
    fileId: id,
    fields: "id,name,mimeType,shortcutDetails",
    supportsAllDrives: true,
  });
  if (meta.data.mimeType === "application/vnd.google-apps.shortcut") {
    return meta.data.shortcutDetails?.targetId || id;
  }
  return id;
}

/* ===== Drive listing (chỉ trong folder) ===== */
async function listDriveChildren(folderId, drive) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id,name,mimeType,parents)",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    corpora: "allDrives",
    pageSize: DRIVE_LIST_PAGESIZE,
  });
  return res.data.files || [];
}

async function listAllImagesRecursive(rootFolderId, drive) {
  const out = [];
  const q = [await resolveShortcutId(rootFolderId, drive)];
  let foldersSeen = 0;

  while (q.length) {
    const fid = q.shift();
    const files = await listDriveChildren(fid, drive);

    for (const f of files) {
      if (f.mimeType === "application/vnd.google-apps.folder") {
        q.push(f.id);
        foldersSeen++;
        continue;
      }
      if (
        f.mimeType === "application/vnd.google-apps.shortcut" ||
        isLikelyImageFile(f)
      ) {
        out.push(f);
      }
    }
  }

  logInfo(
    `Drive recursive listing: scanned ${foldersSeen} folders, collected ${out.length} files under ${rootFolderId}.`
  );
  return out;
}

async function listImagesOneLevel(rootFolderId, drive) {
  const fid = await resolveShortcutId(rootFolderId, drive);
  const files = await listDriveChildren(fid, drive);
  const out = files.filter(
    (f) =>
      f.mimeType === "application/vnd.google-apps.shortcut" ||
      isLikelyImageFile(f)
  );
  logInfo(
    `Drive one-level listing: collected ${out.length} files under ${fid}.`
  );
  return out;
}

/* ===== Tìm file theo code (CHỈ trong folder đã gán) ===== */
async function findDriveFileByCode(code, driveArg) {
  const drive = driveArg || (await getDrive());
  let folderId = process.env.DRIVE_FOLDER_ID;
  if (!folderId) {
    logError("Thiếu biến môi trường DRIVE_FOLDER_ID.");
    return null;
  }

  const upperCode = normalizeForMatch(String(code || ""));
  const codeSquashed = squashNonAlnum(upperCode);

  // Lấy danh sách trong folder (đệ quy hoặc 1 cấp)
  const files = DRIVE_RECURSIVE
    ? await listAllImagesRecursive(folderId, drive)
    : await listImagesOneLevel(folderId, drive);

  if (!files.length) {
    logError(`Folder rỗng hoặc không có ảnh (folderId=${folderId}).`);
    return null;
  }

  // Debug
  const sample = files
    .slice(0, 20)
    .map((f) => f.name)
    .join(", ");
  logInfo(
    `Tìm ảnh cho code=${upperCode}. Tổng files duyệt=${files.length}. 20 tên đầu: ${sample}`
  );

  // (1) exact theo basename cleaned+upper
  let exact = files.find((f) => baseNameUpper(f.name) === upperCode);
  if (exact) {
    const id = await resolveShortcutId(exact.id, drive);
    logInfo(`Match EXACT by basename: ${exact.name} (id=${id})`);
    return { id, name: exact.name, mimeType: exact.mimeType };
  }

  // (2) contains theo cleaned upper
  let contains = files
    .filter((f) => normalizeForMatch(f.name).includes(upperCode))
    .sort((a, b) => a.name.length - b.name.length)[0];
  if (contains) {
    const id = await resolveShortcutId(contains.id, drive);
    logInfo(`Match CONTAINS: ${contains.name} (id=${id})`);
    return { id, name: contains.name, mimeType: contains.mimeType };
  }

  // (3) squashed (bỏ ký tự không phải chữ/số)
  let squashed = files
    .filter((f) => baseNameSquashed(f.name).includes(codeSquashed))
    .sort((a, b) => a.name.length - b.name.length)[0];
  if (squashed) {
    const id = await resolveShortcutId(squashed.id, drive);
    logInfo(`Match SQUASHED: ${squashed.name} (id=${id})`);
    return { id, name: squashed.name, mimeType: squashed.mimeType };
  }

  logError(
    `Không tìm thấy file ảnh khớp mã ${code} trong folder (folderId=${folderId}).`
  );
  return null;
}

async function downloadDriveFileStreamById(fileId, driveArg) {
  const drive = driveArg || (await getDrive());
  try {
    const resp = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );
    return resp.data;
  } catch (e) {
    logError(`Drive get file error (id=${fileId}): ${e.message}`);
    return null;
  }
}

async function uploadDriveFileIdToCloudinary(fileId, code) {
  const drive = await getDrive();
  const folder = process.env.CLOUDINARY_FOLDER || "SMBullyCamp";
  const publicId = code ? `pets_${code}` : undefined;

  const stream = await downloadDriveFileStreamById(fileId, drive);
  if (!stream) throw new Error("Drive stream is null");

  // Ép convert sang JPG để mọi HEIC/HEIF hiển thị tốt
  return new Promise((resolve, reject) => {
    const up = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        overwrite: true,
        resource_type: "image",
        format: "jpg",
      },
      (err, res) => (err ? reject(err) : resolve(res))
    );
    stream.pipe(up);
  });
}

/* Trả về 1 URL duy nhất */
async function uploadImageIfNeeded(imageUrl, code) {
  await getDrive(); // ensure drive init

  // Đã là Cloudinary thì giữ nguyên
  if (imageUrl && /res\.cloudinary\.com/i.test(String(imageUrl))) {
    return String(imageUrl);
  }

  // Link Drive trực tiếp
  if (imageUrl && String(imageUrl).includes("drive.google.com")) {
    const m =
      String(imageUrl).match(/drive\.google\.com\/file\/d\/([^/]+)/i) ||
      String(imageUrl).match(/[?&]id=([^&]+)/i);
    const fileId = m && m[1];
    if (fileId) {
      const res = await uploadDriveFileIdToCloudinary(fileId, code);
      return res.secure_url;
    }
  }

  // URL bất kỳ → ép JPG
  if (imageUrl && /^https?:\/\//i.test(String(imageUrl))) {
    const res = await cloudinary.uploader.upload(String(imageUrl), {
      folder: process.env.CLOUDINARY_FOLDER || "SMBullyCamp",
      public_id: code ? `pets_${code}` : undefined,
      overwrite: true,
      resource_type: "image",
      format: "jpg",
    });
    return res.secure_url;
  }

  // Không có URL → tìm theo code trong folder đã gán
  const drive = await getDrive();
  const gFile = await findDriveFileByCode(code, drive);
  if (gFile?.id) {
    const res = await uploadDriveFileIdToCloudinary(gFile.id, code);
    return res.secure_url;
  }
  return null;
}

/* ===== MAIN (Express handler) ===== */
async function importFromGoogleSheet(req, res) {
  const respond = (status, payload) => {
    if (res && typeof res.status === "function") {
      return res.status(status).json(payload);
    } else {
      console.log(payload);
      return payload;
    }
  };

  const summary = {
    inserted: 0,
    skippedExists: 0,
    skippedNoCode: 0,
    skippedBadDate: 0,
    uploadedImages: 0,
    errors: [],
  };

  try {
    await tgSend(`🚀 Bắt đầu import từ Google Sheet *${process.env.SHEET_ID}*`);

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
      console.log("✅ Connected to MongoDB");
    }

    const sheets = google.sheets({
      version: "v4",
      auth: process.env.GOOGLE_API_KEY, // sheet public-read dùng API key
    });

    const sheetRange = process.env.SHEET_RANGE || "Sheet1!A1:Z";
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: sheetRange,
      valueRenderOption: "FORMATTED_VALUE",
    });

    const [headers, ...rows] = resp.data.values || [];
    if (!headers || headers.length === 0) {
      await tgSend("❌ Import lỗi: Không tìm thấy header trong Sheet");
      return respond(400, { message: "Không tìm thấy header trong Sheet" });
    }

    const data = rows.map((row) => {
      const item = {};
      headers.forEach((h, i) => (item[h] = row[i]));
      return item;
    });

    const codeToGender = {};
    for (const d of data) {
      const c = normalizeCode(d["Code"]);
      if (!c) continue;
      const g = (d["Gender"] || "").toString().trim().toLowerCase();
      codeToGender[c] =
        g === "đực" ? "Male" : g === "cái" ? "Female" : d["Gender"];
    }

    const operations = [];

    for (const d of data) {
      const code = normalizeCode(d["Code"]);
      if (!code) {
        summary.skippedNoCode++;
        const msg = `Thiếu Code: ${JSON.stringify(d)}`;
        summary.errors.push(msg);
        logError(msg);
        continue;
      }

      const exists = await Pet.exists({ code });
      if (exists) {
        summary.skippedExists++;
        continue;
      }

      const birthDate = parseDateFlexible(d["Birth Date"]);
      if (!birthDate) {
        summary.skippedBadDate++;
        const msg = `Ngày sinh không hợp lệ (${d["Birth Date"]}) - ${code}`;
        summary.errors.push(msg);
        logError(msg);
        continue;
      }

      let gender = (d["Gender"] || "").toString().trim().toLowerCase();
      gender =
        gender === "đực" ? "Male" : gender === "cái" ? "Female" : d["Gender"];

      let father = normalizeCode(d["Father"]);
      let mother = normalizeCode(d["Mother"]);
      if (father === code) {
        father = null;
        logError(`Father trùng chính pet (${code}) → set null`);
      }
      if (mother === code) {
        mother = null;
        logError(`Mother trùng chính pet (${code}) → set null`);
      }

      if (father && codeToGender[father] && codeToGender[father] !== "Male") {
        logError(`Father (${father}) không phải Male theo sheet (pet ${code})`);
      }
      if (mother && codeToGender[mother] && codeToGender[mother] !== "Female") {
        logError(
          `Mother (${mother}) không phải Female theo sheet (pet ${code})`
        );
      }

      // Ảnh: chờ upload xong trước khi insert
      let image = null;
      try {
        const uploaded = await uploadImageIfNeeded(d["Image"], code);
        if (uploaded) {
          summary.uploadedImages++;
          image = uploaded;
        } else {
          const msg = `Không tìm thấy ảnh cho code ${code} trong folder Drive (folderId=${process.env.DRIVE_FOLDER_ID}).`;
          summary.errors.push(msg);
          logError(msg);
        }
      } catch (e) {
        const msg = `Upload ảnh lỗi (${code}): ${e.message}`;
        summary.errors.push(msg);
        logError(msg);
      }

      operations.push({
        insertOne: {
          document: {
            code,
            name: (d["Name"] || "").toString().trim() || code,
            birthDate,
            gender,
            color: d["Color"] || undefined,
            weight:
              d["Weight"] !== undefined &&
              d["Weight"] !== "" &&
              !Number.isNaN(Number(d["Weight"]))
                ? Number(d["Weight"])
                : undefined,
            nationality: d["Nationality"] || undefined,
            certificate: d["Certificate"] || undefined,
            image: image || undefined,
            note: d["Note"] || undefined,
            father: father || null,
            mother: mother || null,
          },
        },
      });

      logSuccess(
        `Chuẩn bị thêm pet: ${code} - ${
          (d["Name"] || "").toString().trim() || code
        }`
      );
    }

    if (operations.length > 0) {
      await Pet.bulkWrite(operations, { ordered: false });
      summary.inserted = operations.length;
    }

    const doneMsg =
      `✅ Import hoàn tất\n` +
      `• Inserted: *${summary.inserted}*\n` +
      `• Skipped exists: *${summary.skippedExists}*\n` +
      `• Skipped no code: *${summary.skippedNoCode}*\n` +
      `• Skipped bad date: *${summary.skippedBadDate}*\n` +
      `• Uploaded images: *${summary.uploadedImages}*`;
    await tgSend(doneMsg);

    if (summary.errors.length) {
      await tgChunkAndSend("⚠️ Một số lỗi:", summary.errors.join("\n"));
    }

    return respond(200, { message: "Import thành công", ...summary });
  } catch (err) {
    const msg = `Lỗi toàn cục: ${err.message}`;
    logError(msg);
    await tgSend(`❌ Import lỗi: ${err.message}`);
    return respond(500, { message: msg, ...summary });
  }
}

module.exports = importFromGoogleSheet;
