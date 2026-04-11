import path from "node:path";

// Shared path constants for Playwright storageState files written by
// the `setup` project. Kept in a non-test file so spec files can import
// without tripping the "don't import test files" safeguard.
export const ARTIST_STATE = path.join(__dirname, "..", ".auth", "artist.json");
export const CLIENT_STATE = path.join(__dirname, "..", ".auth", "client.json");
