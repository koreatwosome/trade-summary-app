import React, { useState } from 'react'
import './ScrapePanel.css'

export default function ScrapePanel({ onScrape, loading, smtpConfigured }) {
  const [email, setEmail] = useState('kore2081@naver.com')
  const [sendEmail, setSendEmail] = useState(false)

  const handleClick = () => {
    if (loading) return
    onScrape(email, sendEmail && smtpConfigured)
  }

  return (
    <div className="scrape-panel">
      <div className="panel-hero">
        <div className="hero-icon">🔍</div>
        <div className="hero-text">
          <h2>최신 수출입동향 분석</h2>
          <p>버튼을 누르면 산업통상자원부 보도자료 게시판을 자동으로 탐색하여 최신 수출입동향을 찾고, AI가 읽기 쉬운 형태로 요약해드립니다.</p>
        </div>
      </div>

      <div className="panel-options">
        <div className="option-group">
          <label className="option-label">
            <span className="label-icon">📧</span>
            발송 이메일
          </label>
          <input
            type="email"
            className="email-input"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="example@naver.com"
          />
        </div>

        <div className="option-group">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={e => setSendEmail(e.target.checked)}
              disabled={!smtpConfigured}
            />
            <span className="toggle-text">
              요약 완료 시 자동 이메일 발송
              {!smtpConfigured && (
                <span className="toggle-hint"> (⚙️ 이메일 설정 필요)</span>
              )}
            </span>
          </label>
        </div>
      </div>

      <button
        className={`scrape-btn ${loading ? 'loading' : ''}`}
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? (
          <>
            <span className="btn-spinner" />
            분석 중...
          </>
        ) : (
          <>
            <span>🚀</span>
            최신 수출입동향 가져오기
          </>
        )}
      </button>

      <div className="panel-source">
        <span>📌</span>
        <span>출처: <a href="https://www.motie.go.kr/kor/article/ATCL3f49a5a8c" target="_blank" rel="noreferrer">산업통상자원부 보도·참고자료 게시판</a></span>
      </div>
    </div>
  )
}
