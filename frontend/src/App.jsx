import React, { useState, useEffect, useCallback } from 'react'
import Header from './components/Header.jsx'
import ScrapePanel from './components/ScrapePanel.jsx'
import SummaryViewer from './components/SummaryViewer.jsx'
import SavedReports from './components/SavedReports.jsx'
import Settings from './components/Settings.jsx'
import Toast from './components/Toast.jsx'
import './styles/app.css'

export default function App() {
  const [activeTab, setActiveTab] = useState('main')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [savedReports, setSavedReports] = useState([])
  const [smtpConfigured, setSmtpConfigured] = useState(false)
  const [llmConfigured, setLlmConfigured] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() })
    setTimeout(() => setToast(null), 4000)
  }, [])

  useEffect(() => {
    fetchSavedReports()
    checkSmtpStatus()
    checkLlmStatus()
  }, [])

  const fetchSavedReports = async () => {
    try {
      const res = await fetch('/api/saved-reports')
      if (res.ok) setSavedReports(await res.json())
    } catch {}
  }

  const checkSmtpStatus = async () => {
    try {
      const res = await fetch('/api/smtp-status')
      if (res.ok) {
        const data = await res.json()
        setSmtpConfigured(data.configured)
      }
    } catch {}
  }

  const checkLlmStatus = async () => {
    try {
      const res = await fetch('/api/llm-status')
      if (res.ok) {
        const data = await res.json()
        setLlmConfigured(data.configured)
      }
    } catch {}
  }

  const handleScrape = async (email, sendEmail) => {
    if (!llmConfigured) {
      showToast('⚠️ 먼저 설정 탭에서 LLM API Key를 등록해주세요', 'warning')
      setActiveTab('settings')
      return
    }
    setLoading(true)
    setReport(null)
    try {
      const res = await fetch('/api/scrape-and-summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, send_email: sendEmail }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '요약 생성에 실패했습니다')
      }
      const data = await res.json()
      setReport(data)
      if (data.email_sent) showToast(`📧 이메일이 ${email}으로 발송되었습니다`, 'success')
      setActiveTab('main')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (summary, sendEmail, email) => {
    if (!report) return
    try {
      const res = await fetch('/api/save-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: report.title,
          date: report.date || report.scraped_at?.slice(0, 10) || '',
          summary,
          source_url: report.source_url || '',
          email,
          send_email: sendEmail,
        }),
      })
      if (!res.ok) throw new Error('저장 실패')
      showToast('✅ 보고서가 저장되었습니다', 'success')
      await fetchSavedReports()
    } catch {
      showToast('저장 중 오류가 발생했습니다', 'error')
    }
  }

  const handleSendEmail = async (title, summary, email) => {
    if (!smtpConfigured) {
      showToast('⚠️ 먼저 설정 탭에서 이메일(SMTP) 설정을 완료해주세요', 'warning')
      setActiveTab('settings')
      return
    }
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, summary, email }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '이메일 발송 실패')
      }
      showToast(`📧 이메일이 ${email}으로 발송되었습니다`, 'success')
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const handleLlmSaved = (configured) => {
    setLlmConfigured(configured)
  }

  const handleSmtpSaved = (configured) => {
    setSmtpConfigured(configured)
  }

  return (
    <div className="app-container">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        smtpConfigured={smtpConfigured}
        llmConfigured={llmConfigured}
        savedCount={savedReports.length}
      />

      <main className="app-main">
        {activeTab === 'main' && (
          <div className="animate-fade-in">
            {!llmConfigured && (
              <div className="alert-banner" onClick={() => setActiveTab('settings')} style={{ cursor: 'pointer' }}>
                <span>🔑 AI 요약 기능을 사용하려면 <strong>설정 탭</strong>에서 OpenAI API Key를 등록해주세요 →</span>
              </div>
            )}
            <ScrapePanel
              onScrape={handleScrape}
              loading={loading}
              smtpConfigured={smtpConfigured}
              llmConfigured={llmConfigured}
            />
            {loading && (
              <div className="loading-card animate-fade-in">
                <div className="loading-spinner" />
                <div>
                  <p className="loading-title">분석 중입니다...</p>
                  <p className="loading-sub">산업통상자원부 보도자료를 스크래핑하고 AI가 요약하고 있어요 🤖</p>
                </div>
              </div>
            )}
            {report && !loading && (
              <SummaryViewer
                report={report}
                onSave={handleSave}
                onSendEmail={handleSendEmail}
                smtpConfigured={smtpConfigured}
                defaultEmail="kore2081@naver.com"
              />
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="animate-fade-in">
            <SavedReports
              reports={savedReports}
              onRefresh={fetchSavedReports}
              onSendEmail={handleSendEmail}
              smtpConfigured={smtpConfigured}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="animate-fade-in">
            <Settings
              onLlmSaved={handleLlmSaved}
              onSmtpSaved={handleSmtpSaved}
              showToast={showToast}
            />
          </div>
        )}
      </main>

      {toast && <Toast {...toast} />}
    </div>
  )
}
