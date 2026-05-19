/**
 * SBSSU Industrial Training Report Formatter
 * Fixes:
 *  - Table caption duplication: if user writes "Table 3.2 Frontend Technologies"
 *    before the pipe-table, that line IS the caption — don't auto-generate another one.
 *  - Heading sizes: Chapter=16pt bold centered, 1./1.1/1.1.1=14pt bold, body=12pt
 *  - Table: centered, autofit width, all borders, dual-color rows
 *  - TOC: auto-built from headings
 */

// ── Heading detector ──────────────────────────────────────────────────────────
function detectHeadingLevel(line) {
  const t = line.trim()
  if (/^chapter\s+\d+/i.test(t)) return 1
  if (/^(abstract|introduction|conclusion|references|bibliography|acknowledgements?|appendix|list\s+of\s+(tables|figures)|table\s+of\s+contents|symbols\s+and\s+abbreviations)/i.test(t)) return 1
  // level 2: "1. Title" (no sub-number)
  if (/^\d+\.\s+\S/.test(t) && !/^\d+\.\d+/.test(t)) return 2
  // level 3: "1.1 Title"
  if (/^\d+\.\d+\.?\s+\S/.test(t) && !/^\d+\.\d+\.\d+/.test(t)) return 3
  // level 4: "1.1.1 Title"
  if (/^\d+\.\d+\.\d+\.?\s+\S/.test(t)) return 4
  // ALL CAPS short line
  if (t === t.toUpperCase() && t.length > 3 && t.length < 80 && /[A-Z]/.test(t) && !/[|]/.test(t)) return 1
  return 0
}

function isTableLine(line) {
  return line.includes('|') || (line.includes('\t') && line.split('\t').length >= 2)
}

// Detect if a line is an explicit table caption written by the user
// e.g. "Table 3.2 Frontend Technologies" or "Table: Technologies Used"
function isExplicitTableCaption(line) {
  return /^table[\s.:]\s*\d*\.?\d*\s+\S/i.test(line.trim())
}

function parseTable(lines) {
  const rows = lines
    .filter(l => l.trim() && !/^[-|:\s]+$/.test(l))
    .map(l => {
      if (l.includes('|')) {
        return l.split('|').map(c => c.trim())
          .filter((c, idx, arr) => !(idx === 0 && c === '') && !(idx === arr.length - 1 && c === ''))
      }
      return l.split('\t').map(c => c.trim())
    })
  if (rows.length === 0) return null
  return { headers: rows[0], rows: rows.slice(1) }
}

function isFigureLine(line) {
  return /^(fig(ure)?\.?\s*\d|image\s*\d|\[fig|\[image)/i.test(line.trim())
}

function isListItem(line) {
  return /^(\s*[-•*]\s+|\s*\d+[.)]\s+)/.test(line)
}

// ── Counters ──────────────────────────────────────────────────────────────────
let chapterNum     = 0
let tableCounters  = {}
let figureCounters = {}

function nextTableCaption(explicitCaption) {
  if (!tableCounters[chapterNum]) tableCounters[chapterNum] = 0
  tableCounters[chapterNum]++

  if (explicitCaption) {
    // User wrote e.g. "Table 3.2 Frontend Technologies"
    // Check if they gave an explicit number like "3.2"
    const numMatch = explicitCaption.match(/^table[\s.:]*(\d+)\.(\d+)\s+(.+)/i)
    if (numMatch) {
      // Use EXACTLY what the user wrote — don't override with auto counter
      return `Table ${numMatch[1]}.${numMatch[2]} ${numMatch[3].trim()}`
    }
    // User wrote "Table Frontend Technologies" (no number) — auto-number it
    const stripped = explicitCaption.replace(/^table[\s.:]*\d*\.?\d*\s*/i, '').trim()
    return `Table ${chapterNum}.${tableCounters[chapterNum]} ${stripped}`
  }
  return `Table ${chapterNum}.${tableCounters[chapterNum]} Table`
}

function nextFigureCaption(rawLine) {
  if (!figureCounters[chapterNum]) figureCounters[chapterNum] = 0
  figureCounters[chapterNum]++
  // Check if user wrote explicit number e.g. "Figure 3.1 System Architecture"
  const numMatch = rawLine.match(/^fig(?:ure)?\.?\s*(\d+)\.(\d+)\s+(.+)/i)
  if (numMatch) {
    return `Fig. ${numMatch[1]}.${numMatch[2]} ${numMatch[3].trim()}`
  }
  const label = rawLine && rawLine !== 'Figure' ? rawLine : 'Figure'
  return `Fig. ${chapterNum}.${figureCounters[chapterNum]} ${label}`
}

// ── Main parser ───────────────────────────────────────────────────────────────
export function parseDocument(rawText) {
  chapterNum     = 0
  tableCounters  = {}
  figureCounters = {}

  const lines      = rawText.split('\n')
  const blocks     = []
  const tocEntries = []
  let i           = 0
  let isFirstLine = true

  while (i < lines.length) {
    const line    = lines[i]
    const trimmed = line.trim()

    if (!trimmed) { i++; continue }

    // ── EXPLICIT TABLE CAPTION LINE followed by pipe-table ────────────────
    // e.g. user writes:
    //   Table 3.2 Frontend Technologies
    //   Tech | Version | Use
    //   ...
    if (isExplicitTableCaption(trimmed) && i + 1 < lines.length && isTableLine(lines[i + 1])) {
      const userCaption = trimmed  // keep the user's caption text
      i++ // skip caption line, now i points to first table row
      const tableLines = []
      while (i < lines.length && (isTableLine(lines[i]) || /^[-|:\s]+$/.test(lines[i].trim()))) {
        tableLines.push(lines[i])
        i++
      }
      const parsed = parseTable(tableLines)
      if (parsed) {
        blocks.push({
          type: 'table',
          caption: nextTableCaption(userCaption),
          headers: parsed.headers,
          rows: parsed.rows,
        })
      }
      continue
    }

    // ── PLAIN TABLE (no preceding caption line) ───────────────────────────
    if (isTableLine(trimmed)) {
      const tableLines = []
      while (i < lines.length && (isTableLine(lines[i]) || /^[-|:\s]+$/.test(lines[i].trim()))) {
        tableLines.push(lines[i])
        i++
      }
      const parsed = parseTable(tableLines)
      if (parsed) {
        blocks.push({
          type: 'table',
          caption: nextTableCaption(null),
          headers: parsed.headers,
          rows: parsed.rows,
        })
      }
      continue
    }

    // ── FIGURE ────────────────────────────────────────────────────────────
    if (isFigureLine(trimmed)) {
      // Pass full trimmed line so nextFigureCaption can detect explicit numbers
      const figTitle = trimmed
        .replace(/^(fig(ure)?\.?\s*|image\s*)/i, '')
        .trim() || 'Figure'
      blocks.push({ type: 'figure', caption: nextFigureCaption(figTitle) })
      i++
      continue
    }

    // ── LIST ──────────────────────────────────────────────────────────────
    if (isListItem(trimmed)) {
      const items    = []
      const listType = /^\s*\d+[.)]/.test(trimmed) ? 'ordered' : 'unordered'
      while (i < lines.length && isListItem(lines[i])) {
        items.push(lines[i].replace(/^\s*[-•*]\s+|\s*\d+[.)]\s+/, '').trim())
        i++
      }
      blocks.push({ type: 'list', listType, items })
      continue
    }

    // ── HEADINGS ──────────────────────────────────────────────────────────
    const level = detectHeadingLevel(trimmed)

    if (level === 1) {
      if (/^chapter\s+(\d+)/i.test(trimmed)) {
        const m = trimmed.match(/^chapter\s+(\d+)/i)
        if (m) chapterNum = parseInt(m[1])
      } else {
        chapterNum++
      }
      blocks.push({ type: 'heading1', text: trimmed })
      tocEntries.push({ level: 1, text: trimmed })
      i++; continue
    }
    if (level === 2) {
      blocks.push({ type: 'heading2', text: trimmed })
      tocEntries.push({ level: 2, text: trimmed })
      i++; continue
    }
    if (level === 3) {
      blocks.push({ type: 'heading3', text: trimmed })
      tocEntries.push({ level: 3, text: trimmed })
      i++; continue
    }
    if (level === 4) {
      blocks.push({ type: 'heading4', text: trimmed })
      tocEntries.push({ level: 4, text: trimmed })
      i++; continue
    }

    // ── TITLE (very first non-empty line) ─────────────────────────────────
    if (isFirstLine && trimmed.length < 120) {
      blocks.push({ type: 'title', text: trimmed })
      isFirstLine = false
      i++; continue
    }
    isFirstLine = false

    // ── PARAGRAPH ─────────────────────────────────────────────────────────
    const paraLines = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isTableLine(lines[i]) &&
      !isExplicitTableCaption(lines[i]) &&
      !isFigureLine(lines[i].trim()) &&
      !isListItem(lines[i]) &&
      detectHeadingLevel(lines[i].trim()) === 0
    ) {
      paraLines.push(lines[i].trim())
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join(' ') })
    }
  }

  return { blocks, tocEntries }
}

// ── RTF generator — produces real Word-compatible RTF ─────────────────────────
// Word/WPS opens RTF natively with all formatting preserved:
//  • Times New Roman throughout
//  • Chapter: 16pt bold centered uppercase
//  • Section 1. / 1.1: 14pt bold left
//  • Sub-sub 1.1.1: 12pt bold left
//  • Body: 12pt double-spaced justified
//  • Tables: full-width (9360 twips = 6.5in), all borders, bold blue header,
//            alternating row shading, caption above in bold centered
//  • Figures: placeholder box + italic caption below
//  • Margins: top/bottom 1440 twips (1in), left 1800 (1.25in), right 1440 (1in)

function esc(str) {
  // Escape RTF special chars
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/[^\x00-\x7F]/g, c => {
      const code = c.charCodeAt(0)
      return `\\u${code}?`
    })
}

// twips helpers
const PT  = n => n * 20          // points → twips (half-points for \fs)
const FS  = n => n * 2           // font size in half-points

// Table width in twips: A4 width 12240 - left margin 1800 - right margin 1440 = 8820 twips
const TABLE_WIDTH = 8820

function rtfTableBorder() {
  return '\\brdrs\\brdrw15\\brdrcf2'  // solid, 0.75pt, color index 2 (blue)
}

function rtfCellBorders() {
  const b = rtfTableBorder()
  return `\\clbrdrt${b}\\clbrdrl${b}\\clbrdrb${b}\\clbrdrr${b}`
}

export function generateRTF({ blocks, tocEntries }) {
  // RTF header
  // Color table: 1=black, 2=dark blue (header border), 3=header bg blue, 4=alt row light blue
  const header = [
    '{\\rtf1\\ansi\\deff0',
    '{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}}',
    '{\\colortbl;',
    '\\red0\\green0\\blue0;',           // 1 black
    '\\red21\\green93\\blue149;',        // 2 border blue
    '\\red30\\green125\\blue181;',       // 3 header bg
    '\\red214\\green237\\blue251;',      // 4 alt row
    '\\red255\\green255\\blue255;',      // 5 white
    '}',
    // Page setup: A4, margins 1in T/B, 1.25in L, 1in R
    '\\paperw11906\\paperh16838',
    '\\margl1800\\margr1440\\margt1440\\margb1440',
    '\\widowctrl\\hyphauto',
  ].join('\n')

  const parts = [header]

  // ── TOC ──
  parts.push(rtfPara('TABLE OF CONTENTS', { bold: true, size: 16, align: 'center', spaceAfter: 120 }))
  parts.push(rtfPara('Preliminary Pages', { bold: true, size: 11, align: 'left', color: 2, spaceAfter: 60 }))

  const prelims = [
    ['Certificate', 'i'], ['Abstract', 'ii'], ['Acknowledgement', 'iii'],
    ['List of Tables', 'iv'], ['List of Figures', 'v'], ['Symbols and Abbreviations', 'vi'],
  ]
  prelims.forEach(([label, page]) => {
    parts.push(rtfTocRow(label, page, 0, false))
  })

  if (tocEntries.length > 0) {
    parts.push(rtfPara('Main Chapters', { bold: true, size: 11, align: 'left', color: 2, spaceBefore: 120, spaceAfter: 60 }))
    let arabicPage = 1
    tocEntries.forEach(e => {
      const page = e.level === 1 ? String(arabicPage++) : ''
      const indent = (e.level - 1) * 360  // 360 twips per level
      const bold   = e.level === 1
      parts.push(rtfTocRow(e.text, page, indent, bold))
    })
  }

  // ── Page break → List of Tables ──
  parts.push('{\\pard\\pagebb\\par}')
  parts.push(rtfPara('LIST OF TABLES', { bold: true, size: 16, align: 'center', spaceAfter: 120 }))
  parts.push('{\\pard\\qc\\f0\\fs24\\sb0\\sa120\\brdrb\\brdrs\\brdrw10\\brdrcf2 \\par}')

  const tableBlocks = blocks.filter(b => b.type === 'table')
  if (tableBlocks.length > 0) {
    tableBlocks.forEach((b, i) => {
      parts.push(rtfTocRow(b.caption, String(i + 1), 0, false))
    })
  } else {
    parts.push(rtfPara('No tables found in document.', { size: 12, align: 'center', color: 1 }))
  }

  // ── Page break → List of Figures ──
  parts.push('{\\pard\\pagebb\\par}')
  parts.push(rtfPara('LIST OF FIGURES', { bold: true, size: 16, align: 'center', spaceAfter: 120 }))
  parts.push('{\\pard\\qc\\f0\\fs24\\sb0\\sa120\\brdrb\\brdrs\\brdrw10\\brdrcf2 \\par}')

  const figureBlocks = blocks.filter(b => b.type === 'figure')
  if (figureBlocks.length > 0) {
    figureBlocks.forEach((b, i) => {
      parts.push(rtfTocRow(b.caption, String(i + 1), 0, false))
    })
  } else {
    parts.push(rtfPara('No figures found in document.', { size: 12, align: 'center', color: 1 }))
  }

  // Page break before body
  parts.push('{\\pard\\pagebb\\par}')

  // ── Body blocks ──
  for (const b of blocks) {
    switch (b.type) {

      case 'title':
        parts.push(rtfPara(b.text.toUpperCase(), {
          bold: true, size: 16, align: 'center',
          spaceBefore: 240, spaceAfter: 240,
        }))
        break

      case 'heading1':
        // 16pt bold centered uppercase — chapter heading
        parts.push(rtfPara(b.text.toUpperCase(), {
          bold: true, size: 16, align: 'center',
          spaceBefore: 480, spaceAfter: 240,
          keepNext: true,
        }))
        break

      case 'heading2':
        // 14pt bold LEFT — numbered section
        parts.push(rtfPara(b.text, {
          bold: true, size: 14, align: 'left',
          spaceBefore: 360, spaceAfter: 120,
          keepNext: true,
        }))
        break

      case 'heading3':
        // 14pt bold LEFT — sub-section
        parts.push(rtfPara(b.text, {
          bold: true, size: 14, align: 'left',
          spaceBefore: 240, spaceAfter: 120,
          keepNext: true,
        }))
        break

      case 'heading4':
        // 12pt bold LEFT — sub-sub-section
        parts.push(rtfPara(b.text, {
          bold: true, size: 12, align: 'left',
          spaceBefore: 200, spaceAfter: 80,
          keepNext: true,
        }))
        break

      case 'paragraph':
        // 12pt JUSTIFIED double-spaced
        parts.push(rtfPara(b.text, {
          bold: false, size: 12, align: 'justify',
          spaceBefore: 0, spaceAfter: 0,
          lineSpacing: 480,
        }))
        break

      case 'list':
        b.items.forEach((item, idx) => {
          const prefix = b.listType === 'ordered' ? `${idx + 1}.  ` : '\\bullet  '
          parts.push(rtfPara(prefix + esc(item), {
            bold: false, size: 12, align: 'justify',
            spaceBefore: 0, spaceAfter: 60,
            indent: 360,
            lineSpacing: 480,
            raw: true,
          }))
        })
        break

      case 'table':
        // Caption ABOVE — bold centered 12pt
        parts.push(rtfPara(b.caption, {
          bold: true, size: 12, align: 'center',
          spaceBefore: 240, spaceAfter: 120,
        }))
        // Table
        parts.push(rtfTable(b.headers, b.rows))
        // Empty para after table
        parts.push(rtfPara('', { size: 12, spaceAfter: 120 }))
        break

      case 'figure':
        // Placeholder
        parts.push(rtfPara('[Insert Figure Here]', {
          bold: false, size: 12, align: 'center',
          spaceBefore: 240, spaceAfter: 60,
          border: true,
        }))
        // Caption BELOW — italic centered 12pt
        parts.push(rtfPara(b.caption, {
          bold: false, italic: true, size: 12, align: 'center',
          spaceBefore: 0, spaceAfter: 240,
        }))
        break

      default: break
    }
  }

  parts.push('}')
  return parts.join('\n')
}

// ── RTF paragraph helper ──────────────────────────────────────────────────────
function rtfPara(text, opts = {}) {
  const {
    bold = false, italic = false, size = 12,
    align = 'left', spaceBefore = 0, spaceAfter = 0,
    lineSpacing = 480, indent = 0, color = 1,
    keepNext = false, border = false, raw = false,
  } = opts

  const alignCode = align === 'center' ? '\\qc'
                  : align === 'right'  ? '\\qr'
                  : align === 'justify'? '\\qj'
                  : '\\ql'

  const ls = lineSpacing !== 480
    ? `\\sl${lineSpacing}\\slmult1`
    : '\\sl480\\slmult1'

  const bdr = border
    ? '\\brdrt\\brdrs\\brdrw10\\brdrcf2\\brdrb\\brdrs\\brdrw10\\brdrcf2\\brdrl\\brdrs\\brdrw10\\brdrcf2\\brdrr\\brdrs\\brdrw10\\brdrcf2'
    : ''

  const kn = keepNext ? '\\keepn' : ''

  const content = raw ? text : esc(text)

  return [
    '{\\pard',
    alignCode,
    `\\f0\\fs${FS(size)}`,
    `\\cf${color}`,
    `\\sb${spaceBefore}\\sa${spaceAfter}`,
    ls,
    indent ? `\\li${indent}\\fi0` : '',
    bdr, kn,
    bold   ? '\\b'  : '',
    italic ? '\\i'  : '',
    ` ${content}`,
    bold   ? '\\b0' : '',
    italic ? '\\i0' : '',
    '\\par}',
  ].filter(Boolean).join('')
}

// ── RTF TOC row with dot leader ───────────────────────────────────────────────
function rtfTocRow(label, page, indentTwips, bold) {
  // Tab stop at right margin with dot leader
  const tabStop = `\\tqr\\tldot\\tx${TABLE_WIDTH}`
  const b  = bold ? '\\b' : ''
  const b0 = bold ? '\\b0' : ''
  return `{\\pard\\ql\\f0\\fs${FS(12)}\\sl360\\slmult1\\sb0\\sa0${b}\\li${indentTwips}${tabStop} ${esc(label)}\\tab${page}${b0}\\par}`
}

// ── RTF table ─────────────────────────────────────────────────────────────────
function rtfTable(headers, rows) {
  const colCount = headers.length
  const colW     = Math.floor(TABLE_WIDTH / colCount)
  const parts    = []

  // Header row
  parts.push(rtfTableRow(headers, colW, colCount, true))
  // Data rows
  rows.forEach((row, ri) => {
    const isEven = ri % 2 === 1  // 0-indexed: odd index = even row visually
    parts.push(rtfTableRow(row, colW, colCount, false, isEven))
  })

  return parts.join('\n')
}

function rtfTableRow(cells, colW, colCount, isHeader, isAlt = false) {
  const bgColor = isHeader ? 3 : isAlt ? 4 : 5
  const borders = rtfCellBorders()

  // \trrh0 = auto row height (fits content), \trgaph108 = cell spacing
  let rowDef = '{\\trowd\\trqc\\trgaph108\\trrh0'
  for (let c = 0; c < colCount; c++) {
    rowDef += `${borders}\\clcbpat${bgColor}\\clvertalc\\cellx${colW * (c + 1)}`
  }

  const cellParts = cells.map(cell => {
    const txt   = esc(String(cell ?? ''))
    const bold  = isHeader ? '\\b'  : ''
    const b0    = isHeader ? '\\b0' : ''
    const cf    = isHeader ? '\\cf5' : '\\cf1'
    const align = isHeader ? '\\qc' : '\\ql'
    // \sl240\slmult1 = 1.15 line spacing inside cells (not double — keeps cells compact)
    return `{\\pard${align}\\f0\\fs${FS(11)}${cf}\\sl240\\slmult1\\sb60\\sa60 ${bold}${txt}${b0}\\cell}`
  })

  return `${rowDef}\n${cellParts.join('\n')}\n\\row}`
}

// ── Index-only RTF generator (for the Index Builder section) ─────────────────
// Renders ALL rows the user entered — no auto-added sections
export function generateIndexRTF(indexRows, tableList = [], figureList = []) {
  const header = [
    '{\\rtf1\\ansi\\deff0',
    '{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}}',
    '{\\colortbl;',
    '\\red0\\green0\\blue0;',
    '\\red21\\green93\\blue149;',
    '\\red30\\green125\\blue181;',
    '}',
    '\\paperw11906\\paperh16838',
    '\\margl1800\\margr1440\\margt1440\\margb1440',
  ].join('\n')

  const parts = [header]

  // ── TABLE OF CONTENTS ──
  parts.push(rtfPara('TABLE OF CONTENTS', { bold: true, size: 16, align: 'center', spaceAfter: 160 }))
  parts.push('{\\pard\\qc\\f0\\fs24\\sb0\\sa120\\brdrb\\brdrs\\brdrw10\\brdrcf2 \\par}')

  indexRows.forEach(r => {
    const lvl    = parseInt(r.level) || 1
    const indent = lvl <= 1 ? 0 : (lvl - 1) * 360
    const bold   = lvl <= 1
    const italic = lvl >= 3
    parts.push(rtfTocRowFull(r.text || '', r.page || '', indent, bold, italic))
  })

  // ── LIST OF TABLES ──
  parts.push('{\\pard\\pagebb\\par}')
  parts.push(rtfPara('LIST OF TABLES', { bold: true, size: 16, align: 'center', spaceAfter: 160 }))
  parts.push('{\\pard\\qc\\f0\\fs24\\sb0\\sa120\\brdrb\\brdrs\\brdrw10\\brdrcf2 \\par}')

  if (tableList.length > 0) {
    tableList.forEach(t => {
      parts.push(rtfTocRowFull(t.caption, t.page || '', 0, false, false))
    })
  } else {
    // Extract table entries from indexRows if any match "Table" pattern
    const tableRows = indexRows.filter(r => /^table\s+\d/i.test(r.text))
    if (tableRows.length > 0) {
      tableRows.forEach(r => parts.push(rtfTocRowFull(r.text, r.page || '', 0, false, false)))
    } else {
      parts.push(rtfPara('No tables listed.', { size: 12, align: 'center', color: 1 }))
    }
  }

  // ── LIST OF FIGURES ──
  parts.push('{\\pard\\pagebb\\par}')
  parts.push(rtfPara('LIST OF FIGURES', { bold: true, size: 16, align: 'center', spaceAfter: 160 }))
  parts.push('{\\pard\\qc\\f0\\fs24\\sb0\\sa120\\brdrb\\brdrs\\brdrw10\\brdrcf2 \\par}')

  if (figureList.length > 0) {
    figureList.forEach(f => {
      parts.push(rtfTocRowFull(f.caption, f.page || '', 0, false, false))
    })
  } else {
    const figRows = indexRows.filter(r => /^fig(ure)?\s*[\d.]/i.test(r.text))
    if (figRows.length > 0) {
      figRows.forEach(r => parts.push(rtfTocRowFull(r.text, r.page || '', 0, false, false)))
    } else {
      parts.push(rtfPara('No figures listed.', { size: 12, align: 'center', color: 1 }))
    }
  }

  parts.push('}')
  return parts.join('\n')
}

// Extended TOC row with italic support
function rtfTocRowFull(label, page, indentTwips, bold, italic = false) {
  const tabStop = `\\tqr\\tldot\\tx${TABLE_WIDTH}`
  const b  = bold   ? '\\b'  : ''
  const b0 = bold   ? '\\b0' : ''
  const it = italic ? '\\i'  : ''
  const i0 = italic ? '\\i0' : ''
  return `{\\pard\\ql\\f0\\fs${FS(12)}\\sl360\\slmult1\\sb0\\sa60${b}${it}\\li${indentTwips}${tabStop} ${esc(label)}\\tab${page}${b0}${i0}\\par}`
}

// ── Unstructured Index Parser ─────────────────────────────────────────────────
// Takes raw pasted text like:
//   "Chapter 1 Introduction 1"
//   "1.1 Background 2"
//   "Certificate i"
// Returns array of { level, text, page }
export function parseUnstructuredIndex(rawText) {
  const lines  = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const result = []

  for (const line of lines) {
    // Try to extract trailing page number (arabic or roman)
    // e.g. "Chapter 1 Introduction 1"  →  text="Chapter 1 Introduction", page="1"
    //      "Certificate i"             →  text="Certificate",             page="i"
    const pageMatch = line.match(/^(.+?)\s+((?:[ivxlcdmIVXLCDM]+|\d+))$/)
    let text = line
    let page = ''

    if (pageMatch) {
      // Validate that the last token looks like a page number
      const candidate = pageMatch[2]
      if (/^\d+$/.test(candidate) || /^[ivxlcdmIVXLCDM]+$/i.test(candidate)) {
        text = pageMatch[1].trim()
        page = candidate
      }
    }

    // Determine level
    let level = '2'

    if (/^chapter\s+\d+/i.test(text)) {
      level = '1'
    } else if (/^(abstract|introduction|conclusion|references|bibliography|acknowledgements?|appendix|list\s+of\s+(tables|figures)|table\s+of\s+contents|symbols\s+and\s+abbreviations|certificate|declaration|preface|foreword)/i.test(text)) {
      level = '0'
    } else if (/^\d+\.\d+\.\d+/.test(text)) {
      level = '3'
    } else if (/^\d+\.\d+/.test(text)) {
      level = '2'
    } else if (/^\d+\.?\s+\S/.test(text) && !/^\d+\.\d+/.test(text)) {
      level = '1'
    } else if (text === text.toUpperCase() && text.length > 2 && /[A-Z]/.test(text)) {
      // ALL CAPS short line → treat as chapter-level
      level = '1'
    }

    result.push({ level, text, page })
  }

  return result
}

// Keep plain text as fallback (used for Raw Text tab)
export function generatePlainText({ blocks, tocEntries }) {
  const out = []
  out.push('TABLE OF CONTENTS')
  out.push('─'.repeat(55))
  const prelims = [
    ['Certificate', 'i'], ['Abstract', 'ii'], ['Acknowledgement', 'iii'],
    ['List of Tables', 'iv'], ['List of Figures', 'v'], ['Symbols and Abbreviations', 'vi'],
  ]
  prelims.forEach(([label, page]) => {
    out.push(`${label}${'.'.repeat(Math.max(2, 50 - label.length))}${page}`)
  })
  let arabicPage = 1
  tocEntries.forEach(e => {
    const indent = e.level === 1 ? '' : e.level === 2 ? '    ' : e.level === 3 ? '        ' : '            '
    const page   = e.level === 1 ? arabicPage++ : ''
    out.push(`${indent}${e.text}${'.'.repeat(Math.max(2, 50 - indent.length - e.text.length))}${page}`)
  })
  out.push('', '─'.repeat(55), '')
  for (const b of blocks) {
    switch (b.type) {
      case 'title':    out.push(b.text.toUpperCase(), ''); break
      case 'heading1': out.push('', b.text.toUpperCase(), ''); break
      case 'heading2': out.push('', b.text, ''); break
      case 'heading3': out.push('', b.text, ''); break
      case 'heading4': out.push(b.text, ''); break
      case 'paragraph': out.push(b.text, ''); break
      case 'list':
        b.items.forEach((item, idx) => out.push(b.listType === 'ordered' ? `${idx + 1}. ${item}` : `• ${item}`))
        out.push('')
        break
      case 'table':
        out.push(b.caption)
        out.push(b.headers.join('\t'))
        out.push(b.headers.map(() => '--------').join('\t'))
        b.rows.forEach(row => out.push(row.join('\t')))
        out.push('')
        break
      case 'figure':
        out.push('[Insert Figure Here]')
        out.push(b.caption)
        out.push('')
        break
      default: break
    }
  }
  return out.join('\n')
}
