import React, { useState } from 'react'
import './SavedReports.css'

export default function SavedReports({ reports, onRefresh, onSendEmail, smtpConfigured }) {
  const [expanded, setExpanded] = useState(null)
  const [sendingId, setSendingId] = useState(null)
  const [email, setEmail] = useState('kore2081@naver.com')

  const handleSend = async (report) => {
    setSendingId(report.saved_at)
    await onSendEmail(report.title, report.summary, email)
    setSendingId(null)
  }

  return (
    <div className="saved-reports">
      <div className="reports-header">
        <div>
          <h2>저장된 보고서</h2>
          <p>총 {reports.length}건의 보고서가 저장되어 있습니다</p>
        </div>
        <div className="reports-header-actions">
          <div className="header-email-row">
            <span>📧</span>
            <input
              type="email"
              className="header-email-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="발송 이메일"
            />
          </div>
          <button className="refresh-btn" onClick={onRefresh}>
            🔄 새로고침
          </button>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📂</div>
          <p>저장된 보고서가 없습니다</p>
          <span>분석 탭에서 보고서를 생성하고 저장해보세요</span>
        </div>
      ) : (
        <div className="reports-list">
          {reports.map((report, idx) => (
            <div key={report.saved_at || idx} className="report-card">
              <div
                className="report-card-header"
                onClick={() => setExpanded(expanded === idx ? null : idx)}
              >
                <div className="report-info">
                  <div className="report-date">{report.date || report.saved_at?.slice(0, 10)}</div>
                  <div className="report-title">{report.title}</div>
                </div>
                <div className="report-card-actions" onClick={e => e.stopPropagation()}>
                  {smtpConfigured && (
                    <button
                      className="card-action-btn email"
                      onClick={() => handleSend(report)}
                      disabled={sendingId === report.saved_at}
                    >
                      {sendingId === report.saved_at ? (
                        <><span className="spinner-xs" />발송중</>
                      ) : (
                        '📧 발송'
                      )}
                    </button>
                  )}
                  <button
                    className="card-action-btn expand"
                    onClick={() => setExpanded(expanded === idx ? null : idx)}
                  >
                    {expanded === idx ? '▲ 닫기' : '▼ 보기'}
                  </button>
                </div>
              </div>
              {expanded === idx && (
                <div className="report-body animate-fade-in">
                  <pre className="report-summary">{report.summary}</pre>
                  {report.source_url && (
                    <div className="report-footer">
                      <a href={report.source_url} target="_blank" rel="noreferrer">
                        🔗 원문 보기
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
