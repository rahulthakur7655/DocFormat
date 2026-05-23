import {
  AlignmentType,
  BorderStyle,
  Document,
  LeaderType,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  TabStopType,
} from 'docx'

const TABLE_WIDTH = 8820

const font = 'Times New Roman'
const pageMargins = {
  top: 1440,
  bottom: 1440,
  left: 1800,
  right: 1440,
}

const prelims = [
  ['Certificate', 'i'],
  ['Abstract', 'ii'],
  ['Acknowledgement', 'iii'],
  ['List of Tables', 'iv'],
  ['List of Figures', 'v'],
  ['Symbols and Abbreviations', 'vi'],
]

function run(text, options = {}) {
  return new TextRun({
    text: String(text ?? ''),
    font,
    size: (options.size ?? 12) * 2,
    bold: options.bold,
    italics: options.italics,
    break: options.break,
  })
}

function para(text, options = {}) {
  const children = options.children ?? [run(text, options)]
  return new Paragraph({
    children,
    alignment: options.alignment ?? AlignmentType.LEFT,
    spacing: {
      before: options.before ?? 0,
      after: options.after ?? 0,
      line: options.line ?? 480,
    },
    indent: options.indent ? { left: options.indent } : undefined,
    keepNext: options.keepNext,
    border: options.border
      ? {
          top: { style: BorderStyle.SINGLE, size: 6, color: '155D95' },
          bottom: { style: BorderStyle.SINGLE, size: 6, color: '155D95' },
          left: { style: BorderStyle.SINGLE, size: 6, color: '155D95' },
          right: { style: BorderStyle.SINGLE, size: 6, color: '155D95' },
        }
      : undefined,
  })
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] })
}

function tocRow(label, page = '', level = 0, options = {}) {
  return new Paragraph({
    children: [
      run(label, { bold: options.bold, italics: options.italics }),
      run(`\t${page}`, { bold: options.bold, italics: options.italics }),
    ],
    tabStops: [{ type: TabStopType.RIGHT, position: TABLE_WIDTH, leader: LeaderType.DOT }],
    indent: level > 0 ? { left: level * 360 } : undefined,
    spacing: { after: 60, line: 360 },
  })
}

function sectionTitle(text) {
  return [
    para(text, { size: 16, bold: true, alignment: AlignmentType.CENTER, after: 120 }),
    para('', {
      children: [run('', { size: 12 })],
      alignment: AlignmentType.CENTER,
      after: 120,
      border: { bottom: true },
    }),
  ]
}

function tableCell(text, isHeader, fill) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, fill },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: isHeader ? 12 : 4, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: isHeader ? 12 : 4, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    },
    children: [
      para(text, {
        size: 11,
        bold: isHeader,
        alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
        line: 240,
      }),
    ],
  })
}

function tableBlock(block) {
  const colCount = block.hasHeader && block.headers.length > 0
    ? Math.max(block.headers.length, ...block.rows.map(row => row.length))
    : Math.max(...block.rows.map(row => row.length), 1)

  const rows = []
  if (block.hasHeader && block.headers.length > 0) {
    rows.push(new TableRow({
      children: Array.from({ length: colCount }, (_, i) => tableCell(block.headers[i] ?? '', true, 'D9D9D9')),
    }))
  }

  block.rows.forEach((row, rowIndex) => {
    rows.push(new TableRow({
      children: Array.from(
        { length: colCount },
        (_, i) => tableCell(row[i] ?? '', false, rowIndex % 2 === 0 ? 'FFFFFF' : 'D9D9D9'),
      ),
    }))
  })

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.AUTOFIT,
  })
}

function documentChildren(blocks, tocEntries) {
  const children = []

  children.push(para('TABLE OF CONTENTS', { size: 16, bold: true, alignment: AlignmentType.CENTER, after: 120 }))
  children.push(para('Preliminary Pages', { size: 11, bold: true, after: 60 }))
  prelims.forEach(([label, page]) => children.push(tocRow(label, page)))

  if (tocEntries.length > 0) {
    children.push(para('Main Chapters', { size: 11, bold: true, before: 120, after: 60 }))
    let arabicPage = 1
    tocEntries.forEach(entry => {
      children.push(tocRow(
        entry.text,
        entry.level === 1 ? String(arabicPage++) : '',
        Math.max(entry.level - 1, 0),
        { bold: entry.level === 1 },
      ))
    })
  }

  children.push(pageBreak(), ...sectionTitle('LIST OF TABLES'))
  const tables = blocks.filter(block => block.type === 'table')
  if (tables.length > 0) {
    tables.forEach((block, i) => children.push(tocRow(block.caption, String(i + 1))))
  } else {
    children.push(para('No tables found in document.', { alignment: AlignmentType.CENTER }))
  }

  children.push(pageBreak(), ...sectionTitle('LIST OF FIGURES'))
  const figures = blocks.filter(block => block.type === 'figure')
  if (figures.length > 0) {
    figures.forEach((block, i) => children.push(tocRow(block.caption, String(i + 1))))
  } else {
    children.push(para('No figures found in document.', { alignment: AlignmentType.CENTER }))
  }

  children.push(pageBreak())

  blocks.forEach(block => {
    switch (block.type) {
      case 'title':
        children.push(para(block.text.toUpperCase(), {
          size: 16,
          bold: true,
          alignment: AlignmentType.CENTER,
          before: 240,
          after: 240,
        }))
        break
      case 'heading1':
        children.push(para(block.text.toUpperCase(), {
          size: 16,
          bold: true,
          alignment: AlignmentType.CENTER,
          before: 480,
          after: 240,
          keepNext: true,
        }))
        break
      case 'heading2':
      case 'heading3':
        children.push(para(block.text, {
          size: 14,
          bold: true,
          before: block.type === 'heading2' ? 360 : 240,
          after: 120,
          keepNext: true,
        }))
        break
      case 'heading4':
        children.push(para(block.text, { size: 12, bold: true, before: 200, after: 80, keepNext: true }))
        break
      case 'paragraph':
        children.push(para(block.text, { alignment: AlignmentType.JUSTIFIED, line: 480 }))
        break
      case 'list':
        block.items.forEach((item, i) => {
          const marker = block.listType === 'ordered' ? `${i + 1}.  ` : '•  '
          children.push(para(`${marker}${item}`, { alignment: AlignmentType.JUSTIFIED, indent: 360, after: 60 }))
        })
        break
      case 'table':
        if (block.caption) {
          children.push(para(block.caption, { bold: true, alignment: AlignmentType.CENTER, before: 240, after: 120 }))
        }
        children.push(tableBlock(block))
        children.push(para('', { after: 120 }))
        break
      case 'figure':
        children.push(para('[Insert Figure Here]', {
          alignment: AlignmentType.CENTER,
          before: 240,
          after: 60,
          border: true,
        }))
        children.push(para(block.caption, {
          italics: true,
          alignment: AlignmentType.CENTER,
          after: 240,
        }))
        break
      default:
        break
    }
  })

  return children
}

function createDocument(children) {
  return new Document({
    styles: {
      default: {
        document: {
          run: { font, size: 24 },
          paragraph: { spacing: { line: 480 } },
        },
      },
    },
    sections: [{
      properties: { page: { margin: pageMargins } },
      children,
    }],
  })
}

export function generateDocxBlob({ blocks, tocEntries }) {
  return Packer.toBlob(createDocument(documentChildren(blocks, tocEntries)))
}

export function generateIndexDocxBlob(indexRows, tableList = [], figureList = []) {
  const children = []

  children.push(...sectionTitle('TABLE OF CONTENTS'))
  indexRows.forEach(row => {
    const level = parseInt(row.level, 10) || 1
    children.push(tocRow(row.text || '', row.page || '', level <= 1 ? 0 : level - 1, {
      bold: level <= 1,
      italics: level >= 3,
    }))
  })

  children.push(pageBreak(), ...sectionTitle('LIST OF TABLES'))
  const tableRows = tableList.length > 0
    ? tableList
    : indexRows.filter(row => /^table\s+\d/i.test(row.text || ''))
  if (tableRows.length > 0) {
    tableRows.forEach(row => children.push(tocRow(row.caption || row.text, row.page || '')))
  } else {
    children.push(para('No tables listed.', { alignment: AlignmentType.CENTER }))
  }

  children.push(pageBreak(), ...sectionTitle('LIST OF FIGURES'))
  const figureRows = figureList.length > 0
    ? figureList
    : indexRows.filter(row => /^fig(ure)?\s*[\d.]/i.test(row.text || ''))
  if (figureRows.length > 0) {
    figureRows.forEach(row => children.push(tocRow(row.caption || row.text, row.page || '')))
  } else {
    children.push(para('No figures listed.', { alignment: AlignmentType.CENTER }))
  }

  return Packer.toBlob(createDocument(children))
}
