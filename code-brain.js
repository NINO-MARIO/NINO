var CodeBrain = (function() {
  function analyzeStack(stackTrace) {
    if (!stackTrace || typeof stackTrace !== 'string') return null;
    var lines = stackTrace.split('\n').map(function(l){return l.trim()}).filter(Boolean);
    var culprit = {};
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/node_modules|internal:|node:/i.test(line)) continue;
      var m = line.match(/at\s+(.+?)\s+\((.+?)\):?(\d+):?(\d*)?/);
      if (m) {
        culprit.fn = m[1];
        culprit.file = m[2].split('/').pop();
        culprit.line = parseInt(m[3] || '0', 10);
        culprit.col = parseInt(m[4] || '0', 10);
        break;
      }
      var m2 = line.match(/^(.+?):(\d+):(\d+)$/);
      if (m2) {
        culprit.fn = 'anonymous';
        culprit.file = m2[1].split('/').pop();
        culprit.line = parseInt(m2[2], 10);
        culprit.col = parseInt(m2[3], 10);
        break;
      }
    }
    culprit.rawStack = lines.slice(0, 8).join('\n');
    return (culprit.fn && culprit.file) ? culprit : null;
  }
  function createPatch(filePath, startLine, endLine, replacement) {
    var ts = Date.now();
    var tagS = '// __NINO_PATCH_BACKUP_' + ts + '_START__';
    var tagE = '// __NINO_PATCH_BACKUP_' + ts + '_END__';
    var note = '// ต้นฉบับ: บรรทัด ' + startLine + '-' + endLine + '\n// revert: ลบจาก ' + tagS + ' ถึง ' + tagE;
    var ops = [];
    ops.push({op:'insert', afterLine:startLine-1, content:tagS + '\n' + note});
    ops.push({op:'delete', startLine:startLine, endLine:endLine});
    ops.push({op:'insert', afterLine:startLine-1, content:replacement});
    return {file:filePath, ops:ops, timestamp:ts};
  }
  function readContext(repoFiles, targetFile, keyword, radius) {
    if (!radius) radius = 8;
    var lines = repoFiles[targetFile];
    if (!lines) return [];
    var idxs = [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().indexOf(keyword.toLowerCase()) !== -1) idxs.push(i + 1);
    }
    var snippets = [];
    for (var j = 0; j < idxs.length; j++) {
      var ln = idxs[j];
      var from = Math.max(1, ln - radius);
      var to = Math.min(lines.length, ln + radius);
      var parts = [];
      for (var k = from - 1; k < to; k++) {
        parts.push('  ' + (k+1) + ': ' + lines[k]);
      }
      snippets.push({file:targetFile, matchLine:ln, from:from, to:to, code:parts.join('\n')});
    }
    return snippets;
  }
  function suggestFix(culprit, recentEdits) {
    if (!culprit) return {action:'unknown', hint:'stack ไม่ชัด ลอง read ไฟล์ตรง ๆ'};
    var hints = [];
    if (/undefined is not/.test(culprit.rawStack)) hints.push('ตัวแปร undefined — เช็คการ assign ก่อนใช้');
    if (/Cannot read prop/.test(culprit.rawStack)) hints.push('property ไม่มีใน object — เช็ค null guard');
    if (/Unexpected token/.test(culprit.rawStack)) hints.push('syntax error — เช็คบรรทัดก่อนหน้า (มักเป็น bracket ขาด)');
    if (recentEdits) {
      for (var i = 0; i < recentEdits.length; i++) {
        var e = recentEdits[i];
        if (e.file === culprit.file && e.line && Math.abs(e.line - culprit.line) <= 3) {
          hints.push('edits ล่าสุดใน ' + culprit.file + ':' + e.line + ' อาจเป็นต้นเหตุ — diff เทียบ');
          break;
        }
      }
    }
    return {action:'patch', culprit:culprit, hints:hints};
  }
  return {
    analyzeStack: analyzeStack,
    createPatch: createPatch,
    readContext: readContext,
    suggestFix: suggestFix
  };
})();
window.CodeBrain = CodeBrain;
console.log('[code-brain] สมองแก้ไขโค้ดพร้อมใช้งาน');