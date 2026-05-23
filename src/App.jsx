import { useState, useCallback } from 'react'
import './App.css'
import { parseDocument, generatePlainText, parseUnstructuredIndex } from './formatter'
import { generateDocxBlob, generateIndexDocxBlob } from './docxExporter'

// ── Placeholder ───────────────────────────────────────────────────────────────
const PLACEHOLDER = `Paste your unstructured text here...

Supported:
• Chapter headings  →  "Chapter 1 Introduction"
• Sections          →  "1. Overview" / "1.1 Background" / "1.1.1 Detail"
• Paragraphs        →  any regular text
• Tables            →  write caption first, then pipe-table:
                        Table 3.2 Frontend Technologies
                        Tech | Version | Purpose
                        React | 18.2 | UI
• Figures           →  "Figure 1 System Architecture"
• Lists             →  - item  or  1. item`

// ── Sample ────────────────────────────────────────────────────────────────────
const SAMPLE_INPUT = `Industrial Training Report
XYZ Technologies Pvt. Ltd.

Chapter 1 Introduction

This training report documents the industrial training undertaken at XYZ Technologies Pvt. Ltd. during June–July 2024. The training provided hands-on experience in software development and system design methodologies as per the curriculum requirements of Sardar Beant Singh State University.

1.1 Background

Industrial training is a mandatory component of the B.Tech engineering curriculum. It bridges the gap between theoretical knowledge and practical application in real-world environments.

1.2 Objectives

The primary objectives of this training were to understand the software development lifecycle, gain exposure to industry-standard tools, and develop professional communication skills.

• Understanding of Agile and Scrum methodology
• Hands-on experience with React and Node.js
• Exposure to database management systems
• Team collaboration and project management skills

1.2.1 Specific Goals

Each trainee was assigned specific goals aligned with the department's ongoing projects and the university training guidelines.

Chapter 2 Organization Overview

XYZ Technologies is a leading software solutions company established in 2005. The company specializes in enterprise software development and cloud computing services.

2.1 Departments

Table 2.1 Department Details
Department | Head | Employees | Location
Software Dev | Mr. Sharma | 45 | Block A
QA Testing | Ms. Gupta | 20 | Block B
DevOps | Mr. Kumar | 15 | Block C
HR | Ms. Singh | 10 | Block D

Figure 1 Organizational Structure of XYZ Technologies

2.2 Work Culture

The organization follows a flat hierarchy with open communication channels. Weekly stand-up meetings and sprint reviews are conducted regularly.

Chapter 3 Work Done

During the training period, several tasks were assigned and completed successfully. The work involved both frontend and backend development.

3.1 Project Description

The main project involved developing a student management portal using React for the frontend and Node.js for the backend with MongoDB as the database.

3.2 Technologies Used

Table 3.2 Frontend Technologies
Technology | Purpose | Version
React.js | Frontend UI | 18.2
Node.js | Backend Server | 20.0
MongoDB | Database | 6.0
Express.js | REST API | 4.18
Git | Version Control | 2.40

Figure 2 Technology Stack Architecture Diagram

3.3 Weekly Progress

1. Week 1 - Orientation and environment setup
2. Week 2 - Frontend development with React components
3. Week 3 - Backend REST API development with Node.js
4. Week 4 - Integration, testing and final deployment

3.3.1 Challenges Faced

Several technical challenges were encountered during the integration phase, particularly related to CORS configuration and database connection pooling.`

// ── Prelim pages shown in auto-TOC (formatter tab) ───────────────────────────
const PRELIM_PAGES = [
  { label: 'Certificate',               page: 'i'   },
  { label: 'Abstract',                  page: 'ii'  },
  { label: 'Acknowledgement',           page: 'iii' },
  { label: 'List of Tables',            page: 'iv'  },
  { label: 'List of Figures',           page: 'v'   },
  { label: 'Symbols and Abbreviations', page: 'vi'  },
]

// ── Default index rows — ALL rows in one list (prelims + chapters together) ──
const DEFAULT_INDEX_ROWS = [
  { level: '0', text: 'Certificate',                   page: 'i'   },
  { level: '0', text: 'Abstract',                      page: 'ii'  },
  { level: '0', text: 'Acknowledgement',               page: 'iii' },
  { level: '0', text: 'List of Tables',                page: 'iv'  },
  { level: '0', text: 'List of Figures',               page: 'v'   },
  { level: '0', text: 'Symbols and Abbreviations',     page: 'vi'  },
  { level: '1', text: 'Chapter 1 Introduction',        page: '1'   },
  { level: '2', text: '1.1 Background',                page: '2'   },
  { level: '2', text: '1.2 Objectives',                page: '3'   },
  { level: '3', text: '1.2.1 Specific Goals',          page: '4'   },
  { level: '1', text: 'Chapter 2 Organization Overview', page: '5' },
  { level: '2', text: '2.1 Departments',               page: '6'   },
  { level: '2', text: '2.2 Work Culture',              page: '7'   },
  { level: '1', text: 'Chapter 3 Work Done',           page: '8'   },
  { level: '2', text: '3.1 Project Description',       page: '9'   },
  { level: '2', text: '3.2 Technologies Used',         page: '10'  },
  { level: '2', text: '3.3 Weekly Progress',           page: '11'  },
  { level: '3', text: '3.3.1 Challenges Faced',        page: '12'  },
  { level: '1', text: 'Chapter 4 Results and Discussion', page: '13' },
  { level: '1', text: 'Chapter 5 Conclusion',          page: '15'  },
  { level: '1', text: 'Appendix',                      page: '17'  },
  { level: '1', text: 'References',                    page: '18'  },
]

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [rawInput,    setRawInput]    = useState('')
  const [blocks,      setBlocks]      = useState([])
  const [tocEntries,  setTocEntries]  = useState([])
  const [plainText,   setPlainText]   = useState('')
  const [activeTab,   setActiveTab]   = useState('preview')
  const [activeSection, setActiveSection] = useState('formatter')
  const [copied,      setCopied]      = useState(false)
  const [toast,       setToast]       = useState(null)
  const [hasOutput,   setHasOutput]   = useState(false)

  // Index builder state
  const [indexRows,      setIndexRows]      = useState(DEFAULT_INDEX_ROWS)
  const [rawIndexInput,  setRawIndexInput]  = useState('')
  const [indexInputMode, setIndexInputMode] = useState('manual') // 'manual' | 'parse'

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800) }

  // ── Format ──
  const handleFormat = useCallback(() => {
    if (!rawInput.trim()) { showToast('⚠️ Please enter some text first'); return }
    const result = parseDocument(rawInput)
    const plain  = generatePlainText(result)
    setBlocks(result.blocks)
    setTocEntries(result.tocEntries)
    setPlainText(plain)
    setHasOutput(true)
    showToast('✅ Document formatted — click Download Word File')
  }, [rawInput])

  const handleClear = () => {
    setRawInput(''); setBlocks([]); setTocEntries([]); setPlainText(''); setHasOutput(false)
  }
  const handleLoadSample = () => {
    setRawInput(SAMPLE_INPUT); setBlocks([]); setTocEntries([]); setPlainText(''); setHasOutput(false)
    showToast('📄 Sample text loaded')
  }

  // Download as real .docx file — opens directly in Microsoft Word/WPS
  const handleDownloadWord = async () => {
    const blob = await generateDocxBlob({ blocks, tocEntries })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'training_report.docx'
    a.click()
    URL.revokeObjectURL(url)
    showToast('📥 Downloaded! Open training_report.docx in Word/WPS')
  }

  // Copy plain text fallback
  const handleCopy = () => {
    navigator.clipboard.writeText(plainText).then(() => {
      setCopied(true); showToast('📋 Plain text copied')
      setTimeout(() => setCopied(false), 2200)
    })
  }

  // ── Index builder helpers ──
  const updateRow = (idx, field, val) => {
    setIndexRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: val } : r))
  }
  const addRow = () => setIndexRows(rows => [...rows, { level: '2', text: '', page: '' }])
  const removeRow = (idx) => setIndexRows(rows => rows.filter((_, i) => i !== idx))
  const moveRow = (idx, dir) => {
    setIndexRows(rows => {
      const next = [...rows]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return next
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }
  const handleDownloadIndex = async () => {
    const blob = await generateIndexDocxBlob(indexRows)
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'table_of_contents.docx'
    a.click()
    URL.revokeObjectURL(url)
    showToast('📥 Downloaded! Open table_of_contents.docx in Word/WPS')
  }

  const handleParseIndex = () => {
    if (!rawIndexInput.trim()) { showToast('⚠️ Paste your unstructured index text first'); return }
    const parsed = parseUnstructuredIndex(rawIndexInput)
    if (parsed.length === 0) { showToast('⚠️ Could not detect any headings — check format'); return }
    setIndexRows(parsed)
    setIndexInputMode('manual')
    showToast(`✅ Parsed ${parsed.length} entries — review and download`)
  }

  const wordCount  = rawInput.trim() ? rawInput.trim().split(/\s+/).length : 0
  const paraCount  = blocks.filter(b => b.type === 'paragraph').length
  const tableCount = blocks.filter(b => b.type === 'table').length
  const figCount   = blocks.filter(b => b.type === 'figure').length

  return (
    <div className="app-wrapper">

      {/* ── HEADER ── */}
      <header className="header">
        <div className="header-logo">
          <div className="logo-icon">📄</div>
          <div><h1>Doc<span>Format</span></h1></div>
        </div>
        <div className="header-badge">SBSSU Training Report Formatter</div>
      </header>

      {/* ── NAV ── */}
      <nav className="section-nav">
        <button className={`nav-tab ${activeSection === 'formatter' ? 'active' : ''}`} onClick={() => setActiveSection('formatter')}>
          ✨ Document Formatter
        </button>
        <button className={`nav-tab ${activeSection === 'index' ? 'active' : ''}`} onClick={() => setActiveSection('index')}>
          📑 Index / Table of Contents
        </button>
      </nav>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — FORMATTER
      ══════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'formatter' && (
        <main className="main-content">

          {/* LEFT — INPUT */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <div className="icon">✏️</div>
                <div><h2>Raw Input</h2><p>Paste your unstructured text</p></div>
              </div>
            </div>
            <div className="panel-body">
              <div className="input-section">
                <textarea
                  className="raw-textarea"
                  value={rawInput}
                  onChange={e => setRawInput(e.target.value)}
                  placeholder={PLACEHOLDER}
                  spellCheck={false}
                />
                <div className="btn-row">
                  <button className="btn-primary" onClick={handleFormat}>✨ Format Document</button>
                  <button className="btn-secondary" onClick={handleLoadSample}>📋 Sample</button>
                  <button className="btn-secondary" onClick={handleClear}>🗑️</button>
                </div>
                <div className="format-options">
                  <div className="format-options-title">📐 Auto-Applied — SBSSU Guidelines</div>
                  <div className="options-grid">
                    <div className="option-chip active"><span>✓</span> Chapter: 16pt Bold Centered</div>
                    <div className="option-chip active"><span>✓</span> Section 1. / 1.1: 14pt Bold</div>
                    <div className="option-chip active"><span>✓</span> Body: 12pt TNR Double Spacing</div>
                    <div className="option-chip active"><span>✓</span> Table: Centered + AutoFit</div>
                    <div className="option-chip active"><span>✓</span> Table Caption Above (Table X.Y)</div>
                    <div className="option-chip active"><span>✓</span> No Duplicate Captions</div>
                    <div className="option-chip active"><span>✓</span> Figure Caption Below (Fig. X.Y)</div>
                    <div className="option-chip active"><span>✓</span> TOC Auto-Generated</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="stats-bar">
              <div className="stat-item">📝 <strong>{wordCount}</strong> words</div>
              <div className="stat-item">📄 <strong>{rawInput.split('\n').length}</strong> lines</div>
            </div>
          </div>

          {/* RIGHT — OUTPUT */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <div className="icon">📑</div>
                <div><h2>Formatted Output</h2><p>Word-ready · TNR · SBSSU spec</p></div>
              </div>
            </div>
            <div className="panel-body">
              <div className="output-section">
                <div className="output-toolbar">
                  <div className="output-tabs">
                    <button className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>👁 Preview</button>
                    <button className={`tab-btn ${activeTab === 'toc'     ? 'active' : ''}`} onClick={() => setActiveTab('toc')}>📑 TOC</button>
                    <button className={`tab-btn ${activeTab === 'lot'     ? 'active' : ''}`} onClick={() => setActiveTab('lot')}>📊 Tables</button>
                    <button className={`tab-btn ${activeTab === 'lof'     ? 'active' : ''}`} onClick={() => setActiveTab('lof')}>🖼 Figures</button>
                    <button className={`tab-btn ${activeTab === 'raw'     ? 'active' : ''}`} onClick={() => setActiveTab('raw')}>&lt;/&gt; Raw</button>
                  </div>
                  {hasOutput && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-download" onClick={handleDownloadWord}>
                        📥 Download Word File (.docx)
                      </button>
                      <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy} title="Copy plain text">
                        {copied ? '✅' : '📋'}
                      </button>
                    </div>
                  )}
                </div>

                {!hasOutput && (
                  <div className="empty-state">
                    <div className="empty-icon">📄</div>
                    <p>Paste your text and click <strong>Format Document</strong>.<br />Tables, figures, and TOC will be auto-formatted.</p>
                  </div>
                )}

                {hasOutput && activeTab === 'preview' && (
                  <div className="formatted-output">
                    <div className="word-preview">
                      {blocks.map((block, idx) => <BlockRenderer key={idx} block={block} />)}
                      <div className="doc-page-note">
                        Times New Roman 12pt · Double Spacing · A4 (1in T/B · 1.25in L · 1in R)
                      </div>
                    </div>
                  </div>
                )}

                {hasOutput && activeTab === 'toc' && (
                  <div className="formatted-output">
                    <div className="word-preview toc-preview">
                      <TocRenderer tocEntries={tocEntries} />
                    </div>
                  </div>
                )}

                {hasOutput && activeTab === 'lot' && (
                  <div className="formatted-output">
                    <div className="word-preview toc-preview">
                      <ListOfTablesRenderer blocks={blocks} />
                    </div>
                  </div>
                )}

                {hasOutput && activeTab === 'lof' && (
                  <div className="formatted-output">
                    <div className="word-preview toc-preview">
                      <ListOfFiguresRenderer blocks={blocks} />
                    </div>
                  </div>
                )}

                {hasOutput && activeTab === 'raw' && (
                  <pre className="raw-output">{plainText}</pre>
                )}
              </div>
            </div>
            {hasOutput && (
              <div className="stats-bar">
                <div className="stat-item">📑 <strong>{paraCount}</strong> paragraphs</div>
                <div className="stat-item">📊 <strong>{tableCount}</strong> tables</div>
                <div className="stat-item">🖼 <strong>{figCount}</strong> figures</div>
                <div className="stat-item">🧩 <strong>{blocks.length}</strong> blocks</div>
              </div>
            )}
          </div>
        </main>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — INDEX BUILDER
      ══════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'index' && (
        <main className="index-content">
          <div className="index-layout">

            {/* LEFT — ROW EDITOR */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <div className="icon">✏️</div>
                  <div><h2>Build Your Index</h2><p>Add / edit rows, set level and page number</p></div>
                </div>
                {/* Mode toggle */}
                <div className="idx-mode-toggle">
                  <button
                    className={`idx-mode-btn ${indexInputMode === 'parse' ? 'active' : ''}`}
                    onClick={() => setIndexInputMode('parse')}
                  >📋 Paste &amp; Parse</button>
                  <button
                    className={`idx-mode-btn ${indexInputMode === 'manual' ? 'active' : ''}`}
                    onClick={() => setIndexInputMode('manual')}
                  >✏️ Manual Edit</button>
                </div>
              </div>
              <div className="panel-body" style={{ padding: '16px 20px' }}>

                {/* ── PARSE MODE ── */}
                {indexInputMode === 'parse' && (
                  <div className="idx-parse-area">
                    <p className="idx-parse-hint">
                      Paste your unstructured index / TOC text below. Each line should have a heading and optionally a page number.
                      <br /><em>Examples: "Chapter 1 Introduction 1", "1.1 Background 2", "Certificate i"</em>
                    </p>
                    <textarea
                      className="raw-textarea"
                      style={{ minHeight: 320, fontFamily: 'Times New Roman, serif', fontSize: '13px' }}
                      value={rawIndexInput}
                      onChange={e => setRawIndexInput(e.target.value)}
                      placeholder={`Paste unstructured index here, e.g.:\n\nCertificate i\nAbstract ii\nAcknowledgement iii\nList of Tables iv\nList of Figures v\nChapter 1 Introduction 1\n1.1 Background 2\n1.2 Objectives 3\n1.2.1 Specific Goals 4\nChapter 2 Organization Overview 5\n2.1 Departments 6\nReferences 18`}
                      spellCheck={false}
                    />
                    <div className="btn-row" style={{ marginTop: 12 }}>
                      <button className="btn-primary" onClick={handleParseIndex}>🔍 Parse &amp; Build Index</button>
                      <button className="btn-secondary" onClick={() => setRawIndexInput('')}>🗑️ Clear</button>
                    </div>
                  </div>
                )}

                {/* ── MANUAL MODE ── */}
                {indexInputMode === 'manual' && (
                  <>
                    <div className="index-table-wrap">
                      <table className="index-editor-table">
                        <thead>
                          <tr>
                            <th style={{ width: 70 }}>Level</th>
                            <th>Heading / Title</th>
                            <th style={{ width: 60 }}>Page</th>
                            <th style={{ width: 80 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {indexRows.map((row, idx) => (
                            <tr key={idx} className={`idx-row idx-level-${row.level}`}>
                              <td>
                                <select
                                  className="idx-select"
                                  value={row.level}
                                  onChange={e => updateRow(idx, 'level', e.target.value)}
                                >
                                  <option value="0">Prelim (i,ii)</option>
                                  <option value="1">Ch (16pt)</option>
                                  <option value="2">1.1 (14pt)</option>
                                  <option value="3">1.1.1 (12pt)</option>
                                </select>
                              </td>
                              <td>
                                <input
                                  className="idx-input"
                                  value={row.text}
                                  onChange={e => updateRow(idx, 'text', e.target.value)}
                                  placeholder="Heading text..."
                                />
                              </td>
                              <td>
                                <input
                                  className="idx-page"
                                  value={row.page}
                                  onChange={e => updateRow(idx, 'page', e.target.value)}
                                  placeholder="1"
                                />
                              </td>
                              <td>
                                <div className="idx-actions">
                                  <button className="idx-btn" onClick={() => moveRow(idx, -1)} title="Move up">↑</button>
                                  <button className="idx-btn" onClick={() => moveRow(idx, 1)}  title="Move down">↓</button>
                                  <button className="idx-btn idx-del" onClick={() => removeRow(idx)} title="Delete">✕</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="btn-row" style={{ marginTop: 14 }}>
                      <button className="btn-primary" onClick={addRow}>+ Add Row</button>
                      <button className="btn-secondary" onClick={() => setIndexRows(DEFAULT_INDEX_ROWS)}>↺ Reset</button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* RIGHT — PREVIEW */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <div className="icon">📑</div>
                  <div><h2>Index Preview</h2><p>Formatted per SBSSU spec · TNR 12pt</p></div>
                </div>
                <button className="btn-download" onClick={handleDownloadIndex}>
                  📥 Download Index (.docx)
                </button>
              </div>
              <div className="panel-body">
                <div className="formatted-output">
                  <div className="word-preview toc-preview">
                    <IndexPreview rows={indexRows} />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </main>
      )}

      {/* ── FOOTER ── */}
      <footer className="footer">
        SBSSU Training Report Formatter &nbsp;·&nbsp;
        TNR 12pt · Double Spacing · A4 Margins · Chapter 16pt · Section 14pt · Auto TOC · No Duplicate Captions
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

// ── Block Renderer ─────────────────────────────────────────────────────────────
function BlockRenderer({ block }) {
  switch (block.type) {
    case 'title':
      return <h1 className="doc-title">{block.text}</h1>
    case 'heading1':
      // 16pt bold centered uppercase
      return <h2 className="doc-chapter">{block.text}</h2>
    case 'heading2':
      // 14pt bold left
      return <h3 className="doc-section">{block.text}</h3>
    case 'heading3':
      // 14pt bold left
      return <h4 className="doc-subsection">{block.text}</h4>
    case 'heading4':
      // 12pt bold left
      return <h5 className="doc-subsubsection">{block.text}</h5>
    case 'paragraph':
      return <p className="doc-para">{block.text}</p>
    case 'list':
      return block.listType === 'ordered'
        ? <ol className="doc-list">{block.items.map((item, i) => <li key={i}>{item}</li>)}</ol>
        : <ul className="doc-list">{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
    case 'table':
      return (
        <div className="doc-table-wrapper">
          {/* Caption ABOVE — bold centered TNR 12pt */}
          <div className="doc-table-caption">{block.caption}</div>
          {/* Table: centered, autofit (width:100%), all borders, dual-color */}
          <table className="doc-table">
            <thead>
              <tr>{block.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'figure':
      return (
        <div className="doc-figure-wrapper">
          <div className="doc-figure-placeholder">🖼&nbsp; [Insert Figure Here]</div>
          {/* Caption BELOW — italic centered TNR 12pt */}
          <div className="doc-figure-caption">{block.caption}</div>
        </div>
      )
    default:
      return null
  }
}

// ── Auto TOC Renderer (from formatter output) — one clean output ──────────────
function TocRenderer({ tocEntries }) {
  let arabicPage = 1
  return (
    <div className="toc-page-sim">
      <div className="toc-main-title">TABLE OF CONTENTS</div>
      <div className="toc-divider" />

      {/* Prelim pages */}
      {PRELIM_PAGES.map((p, i) => (
        <div key={`p${i}`} className="toc-row toc-l0">
          <span className="toc-label">{p.label}</span>
          <span className="toc-dots" />
          <span className="toc-page">{p.page}</span>
        </div>
      ))}

      {/* Chapter entries from parsed document */}
      {tocEntries.map((e, i) => {
        const page = e.level === 1 ? arabicPage++ : ''
        return (
          <div key={`e${i}`} className={`toc-row toc-l${e.level}`}>
            <span className="toc-label">{e.text}</span>
            <span className="toc-dots" />
            <span className="toc-page">{page}</span>
          </div>
        )
      })}

      {tocEntries.length === 0 && (
        <div style={{ color: '#aaa', fontFamily: 'Times New Roman', fontSize: '12pt', textAlign: 'center', padding: '30px 0' }}>
          Format a document first to auto-generate the TOC
        </div>
      )}
    </div>
  )
}

// ── List of Tables Renderer ───────────────────────────────────────────────────
function ListOfTablesRenderer({ blocks }) {
  const tables = blocks.filter(b => b.type === 'table')
  return (
    <div className="toc-page-sim">
      <div className="toc-main-title">LIST OF TABLES</div>
      <div className="toc-divider" />
      {tables.length === 0 && (
        <div style={{ color: '#aaa', fontFamily: 'Times New Roman', fontSize: '12pt', textAlign: 'center', padding: '30px 0' }}>
          No tables found in the formatted document
        </div>
      )}
      {tables.map((t, i) => (
        <div key={i} className="toc-row toc-l1">
          <span className="toc-label">{t.caption}</span>
          <span className="toc-dots" />
          <span className="toc-page">{i + 1}</span>
        </div>
      ))}
    </div>
  )
}

// ── List of Figures Renderer ──────────────────────────────────────────────────
function ListOfFiguresRenderer({ blocks }) {
  const figures = blocks.filter(b => b.type === 'figure')
  return (
    <div className="toc-page-sim">
      <div className="toc-main-title">LIST OF FIGURES</div>
      <div className="toc-divider" />
      {figures.length === 0 && (
        <div style={{ color: '#aaa', fontFamily: 'Times New Roman', fontSize: '12pt', textAlign: 'center', padding: '30px 0' }}>
          No figures found in the formatted document
        </div>
      )}
      {figures.map((f, i) => (
        <div key={i} className="toc-row toc-l1">
          <span className="toc-label">{f.caption}</span>
          <span className="toc-dots" />
          <span className="toc-page">{i + 1}</span>
        </div>
      ))}
    </div>
  )
}
// level 0 = prelim (roman, bold, no indent)
// level 1 = chapter (bold, 16pt style, no indent)
// level 2 = section (normal, indent 1)
// level 3 = sub-section (normal italic, indent 2)
function IndexPreview({ rows }) {
  return (
    <div className="toc-page-sim">
      {/* Title */}
      <div className="toc-main-title">TABLE OF CONTENTS</div>
      <div className="toc-divider" />

      {/* All rows in one list — exactly what user entered */}
      {rows.map((r, i) => {
        const lvl = r.level || '1'
        return (
          <div key={i} className={`toc-row toc-l${lvl}`}>
            <span className="toc-label">
              {r.text || <em style={{ color: '#bbb', fontStyle: 'italic' }}>—</em>}
            </span>
            <span className="toc-dots" />
            <span className="toc-page">{r.page}</span>
          </div>
        )
      })}

      {rows.length === 0 && (
        <div style={{ color: '#aaa', fontFamily: 'Times New Roman', fontSize: '12pt', textAlign: 'center', padding: '40px 0' }}>
          Add rows on the left to build your index
        </div>
      )}
    </div>
  )
}
