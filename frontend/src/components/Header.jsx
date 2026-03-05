import React from 'react'
import './Header.css'

export default function Header({ activeTab, setActiveTab, smtpConfigured, savedCount }) {
  const tabs = [
    { id: 'main', label: '📊 요약 분석', desc: '최신 보도자료 분석' },
    { id: 'history', label: '📁 저장 보고서', desc: `${savedCount}건` },
    { id: 'settings', label: '⚙️ 이메일 설정', desc: smtpConfigured ? '설정됨 ✅' : '미설정' },
  ]

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <div className="brand-icon">📈</div>
          <div className="brand-text">
            <h1 className="brand-title">수출입동향 요약 서비스</h1>
            <p className="brand-sub">산업통상자원부 보도자료 · AI 자동 요약</p>
          </div>
        </div>
        <nav className="header-nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="nav-label">{tab.label}</span>
              <span className="nav-desc">{tab.desc}</span>
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}
