require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

(async () => {
  try {
    // Lấy path từ ENV và convert sang tuyệt đối
    const keyPath = path.resolve(
      process.env.GOOGLE_APPLICATION_CREDENTIALS || ""
    );
    console.log("Key file path:", keyPath, "exists:", fs.existsSync(keyPath));
    if (!fs.existsSync(keyPath)) {
      throw new Error("Key file not found at path above");
    }

    // Auth Google Drive API
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    const client = await auth.getClient();
    const drive = google.drive({ version: "v3", auth: client });

    let folderId = process.env.DRIVE_FOLDER_ID;
    if (!folderId) throw new Error("DRIVE_FOLDER_ID is not set");

    // Lấy danh sách file trong folder
    const r = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id,name)",
      pageSize: 3,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: "allDrives",
    });

    console.log("✅ Files:", r.data.files);
  } catch (e) {
    console.error("❌ TEST ERROR:", e.message);
  }
})();
