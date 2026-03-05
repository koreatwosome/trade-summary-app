import React, { useState } from 'react'
import './SummaryViewer.css'

export default function SummaryViewer({ report, onSave, onSendEmail, smtpConfigured, defaultEmail }) {
  const [editMode, setEditMode] = useState(false)
  const [summary, setSummary] = useState(report.summary)
  const [email, setEmail] = useState(defaultEmail)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendEmailOnSave, setSendEmailOnSave] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave(summary, sendEmailOnSave, email)
    setSaving(false)
    setEditMode(false)
  }

  const handleSendEmail = async () => {
    setSending(true)
    await onSendEmail(report.title, summary, email)
    setSending(false)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(summary)
  }

  // 요약 텍스트를 HTML로 렌더링 (포맷팅)
  const renderSummary = (text) => {
    if (!text) return null
    return text.split('\n').map((line, i) => {
      if (!line.trim()) return <div key={i} className="line-empty" />

      // 제목 (<<...>>)
      if (line.includes('<<') && line.includes('>>')) {
        return (
          <div key={i} className="summary-title">
            {line}
          </div>
        )
      }
      // 카테고리 (- ...)
      if (/^-\s+[가-힣a-zA-Z]/.test(line.trim())) {
        return (
          <div key={i} className="summary-category">
            {line.trim().replace(/^-\s*/, '')}
          </div>
        )
      }
      // 항목 (> ...)
      if (/^>/.test(line.trim())) {
        const content = line.trim().replace(/^>\s*/, '')
        // 증가/감소 키워드 강조
        const formatted = content
          .replace(/크게\s*증가|급증|역대\s*최대|ATH/g, m => `<span class="badge-up">${m}</span>`)
          .replace(/크게\s*감소|급락|역대\s*최저/g, m => `<span class="badge-down">${m}</span>`)
          .replace(/소폭\s*증가|MOM\s*증가|증가|플러스/g, m => `<span class="badge-up-light">${m}</span>`)
          .replace(/소폭\s*감소|MOM\s*감소|감소|마이너스/g, m => `<span class="badge-down-light">${m}</span>`)
        return (
          <div key={i} className="summary-item">
            <span className="item-arrow">▸</span>
            <span dangerouslySetInnerHTML={{ __html: formatted }} />
          </div>
        )
      }
      // 인사이트 (💡)
      if (line.includes('💡')) {
        return (
          <div key={i} className="summary-insight">
            {line}
          </div>
        )
      }
      // 일반 텍스트
      return <p key={i} className="summary-text">{line}</p>
    })
  }

  return (
    <div className="summary-viewer animate-fade-in">
      {/* 헤더 */}
      <div className="viewer-header">
        <div className="viewer-meta">
          <div className="meta-badge">
            <span>📅</span>
            {report.date || report.scraped_at?.slice(0, 10)}
          </div>
          {report.source_url && (
            <a href={report.source_url} target="_blank" rel="noreferrer" className="meta-link">
              🔗 원문 보기
            </a>
          )}
        </div>
        <h2 className="viewer-title">{report.title}</h2>
        <div className="viewer-actions-top">
          <button
            className={`action-btn ${editMode ? 'active' : ''}`}
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? '👁️ 미리보기' : '✏️ 편집'}
          </button>
          <button className="action-btn" onClick={handleCopy}>
            📋 복사
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div className="viewer-body">
        {editMode ? (
          <textarea
            className="edit-textarea"
            value={summary}
            onChange={e => setSummary(e.target.value)}
            rows={24}
            placeholder="요약 내용을 편집하세요..."
          />
        ) : (
          <div className="summary-content">
            {renderSummary(summary)}
          </div>
        )}
      </div>

      {/* 푸터 액션 */}
      <div className="viewer-footer">
        <div className="footer-email-row">
          <label className="footer-label">
            <span>📧</span> 이메일
          </label>
          <input
            type="email"
            className="footer-email-input"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>

        <div className="footer-btn-row">
          {editMode && (
            <label className="send-on-save-label">
              <input
                type="checkbox"
                checked={sendEmailOnSave}
                onChange={e => setSendEmailOnSave(e.target.checked)}
                disabled={!smtpConfigured}
              />
              저장 시 이메일 발송
            </label>
          )}

          <div className="footer-btns">
            {smtpConfigured && (
              <button
                className="btn-email"
                onClick={handleSendEmail}
                disabled={sending}
              >
                {sending ? (
                  <><span className="btn-spinner-sm" />발송 중...</>
                ) : (
                  <>📧 이메일 발송</>
                )}
              </button>
            )}
            {!smtpConfigured && (
              <span className="smtp-notice">⚙️ 이메일 발송하려면 설정 탭에서 SMTP를 설정하세요</span>
            )}
            <button
              className="btn-save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <><span className="btn-spinner-sm" />저장 중...</>
              ) : (
                <>💾 저장</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
