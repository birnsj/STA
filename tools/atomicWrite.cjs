const fs = require('fs')

// Saves a file by writing a sibling temp file and renaming it over the target, so a crash or a full disk mid-write
// can't leave an authored file half-written. The bytes that end up in the file are exactly `data`.
// The temp name doesn't end in .json, so the stores' folder listings never mistake it for content.
function writeFileAtomic(file, data) {
  const temp = `${file}.${process.pid}.tmp`
  try {
    fs.writeFileSync(temp, data)
    fs.renameSync(temp, file)
  } catch (error) {
    fs.rmSync(temp, { force: true })
    // On Windows the rename can be refused while another process (a file watcher, antivirus) holds the target open.
    // Writing in place is what the stores did before, so fall back to it rather than lose the save.
    if (error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'EACCES') throw error
    fs.writeFileSync(file, data)
  }
}

module.exports = { writeFileAtomic }
