import React, { useState, useEffect } from 'react'
import './Settings.css'

/* ─────────────────────────── LLM 섹션 ─────────────────────────── */
function LlmSection({ onSaved, showToast }) {
  const [form, setForm] = useState({
    api_key: '',
    base_url: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  })
  const [status, setStatus] = useState(null)   // { configured, model, base_url, api_key_hint }
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => { fetchStatus() }, [])

  const fetchStatus = async () => {
    try {
      const r = await fetch('/api/llm-status')
      if (r.ok) setStatus(await r.json())
    } catch {}
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.api_key.trim()) { showToast('API Key를 입력해주세요', 'error'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/llm-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || '저장 실패')
      await fetchStatus()
      onSaved(true)
      showToast(`✅ API Key 저장 완료! 테스트 응답: "${data.test_response}"`, 'success')
      setForm(prev => ({ ...prev, api_key: '' }))  // 저장 후 입력창 비우기
    } catch (e) {
      showToast(`❌ ${e.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!window.confirm('저장된 API Key를 삭제하시겠습니까?')) return
    setRemoving(true)
    try {
      await fetch('/api/llm-config', { method: 'DELETE' })
      await fetchStatus()
      onSaved(false)
      showToast('API Key가 삭제되었습니다', 'success')
    } catch {
      showToast('삭제 중 오류가 발생했습니다', 'error')
    } finally {
      setRemoving(false)
    }
  }

  const MODEL_PRESETS = [
    { label: 'GPT-4o mini', value: 'gpt-4o-mini' },
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-4.1', value: 'gpt-4.1' },
    { label: 'GPT-4.1 mini', value: 'gpt-4.1-mini' },
    { label: 'Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022' },
  ]

  const BASE_URL_PRESETS = [
    { label: 'OpenAI', value: 'https://api.openai.com/v1' },
    { label: 'OpenRouter', value: 'https://openrouter.ai/api/v1' },
    { label: 'Genspark', value: 'https://www.genspark.ai/api/llm_proxy/v1' },
  ]

  return (
    <section className="settings-section">
      <div className="section-head">
        <span className="section-icon">🤖</span>
        <div>
          <h3>LLM API Key 설정</h3>
          <p>OpenAI 또는 호환 API Key를 입력하면 AI 요약 기능이 활성화됩니다</p>
        </div>
        {status?.configured && (
          <span className="badge-ok">✅ 설정됨</span>
        )}
      </div>

      {/* 현재 상태 카드 */}
      {status?.configured && (
        <div className="status-card status-card--ok">
          <div className="status-rows">
            <div className="status-row">
              <span>API Key</span>
              <code>{status.api_key_hint}•••••••••</code>
            </div>
            <div className="status-row">
              <span>모델</span>
              <code>{status.model}</code>
            </div>
            <div className="status-row">
              <span>Base URL</span>
              <code className="url-code">{status.base_url}</code>
            </div>
          </div>
          <button className="btn-danger-sm" onClick={handleRemove} disabled={removing}>
            {removing ? '삭제 중…' : '🗑 키 삭제'}
          </button>
        </div>
      )}

      {/* 입력 폼 */}
      <form onSubmit={handleSave} className="settings-form">
        {/* Base URL 프리셋 */}
        <div className="form-group">
          <label>서비스 선택</label>
          <div className="preset-row">
            {BASE_URL_PRESETS.map(p => (
              <button
                key={p.value}
                type="button"
                className={`preset-chip ${form.base_url === p.value ? 'active' : ''}`}
                onClick={() => setForm(f => ({ ...f, base_url: p.value }))}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group fg-grow">
            <label htmlFor="llm-base-url">Base URL</label>
            <input
              id="llm-base-url"
              type="text"
              value={form.base_url}
              onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div className="form-group">
            <label>모델</label>
            <div className="preset-row wrap">
              {MODEL_PRESETS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  className={`preset-chip ${form.model === m.value ? 'active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, model: m.value }))}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="llm-api-key">
            API Key
            {status?.configured && (
              <span className="label-hint">　현재 저장된 키가 있습니다. 새 키를 입력하면 덮어씁니다.</span>
            )}
          </label>
          <div className="input-with-toggle">
            <input
              id="llm-api-key"
              type={showKey ? 'text' : 'password'}
              value={form.api_key}
              onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
              placeholder={status?.configured ? '새 API Key 입력 (변경 시에만)' : 'sk-…  또는  해당 서비스의 API Key'}
              autoComplete="off"
            />
            <button type="button" className="eye-btn" onClick={() => setShowKey(v => !v)}>
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        <div className="guide-box">
          <strong>📌 OpenAI API Key 발급 방법</strong>
          <ol>
            <li><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com/api-keys</a> 접속</li>
            <li>「+ Create new secret key」 클릭</li>
            <li>생성된 <code>sk-…</code> 키를 위 입력창에 붙여넣기</li>
          </ol>
          <p className="guide-note">⚠️ API 사용 요금이 발생합니다. GPT-4o mini 기준 요약 1건 ≈ $0.001 미만입니다.</p>
        </div>

        <button type="submit" className="btn-primary-full" disabled={saving || !form.api_key.trim()}>
          {saving
            ? <><span className="spinner-sm" />검증 및 저장 중…</>
            : '🔑 API Key 검증 & 저장'}
        </button>
      </form>
    </section>
  )
}


/* ─────────────────────────── SMTP 섹션 ─────────────────────────── */
function SmtpSection({ onSaved, showToast }) {
  const [form, setForm] = useState({
    smtp_host: 'smtp.naver.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
  })
  const [status, setStatus] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showPass, setShowPass] = useState(false)

  useEffect(() => {
    fetch('/api/smtp-status').then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setStatus(d)
        if (d.smtp_user) setForm(f => ({ ...f, smtp_host: d.smtp_host || f.smtp_host, smtp_user: d.smtp_user }))
      }
    }).catch(() => {})
  }, [])

  const PRESETS = [
    { name: '네이버', host: 'smtp.naver.com', port: 587 },
    { name: 'Gmail', host: 'smtp.gmail.com', port: 587 },
    { name: '다음', host: 'smtp.daum.net', port: 465 },
  ]

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.smtp_user || !form.smtp_pass) { showToast('이메일과 비밀번호를 입력해주세요', 'error'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/smtp-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || '저장 실패')
      const r2 = await fetch('/api/smtp-status')
      if (r2.ok) setStatus(await r2.json())
      onSaved(true)
      showToast(
        data.test_email_sent
          ? '✅ SMTP 설정 완료! 테스트 이메일이 발송되었습니다'
          : '✅ 설정 저장됨 (테스트 이메일 발송 실패 — 계정 설정 확인)',
        data.test_email_sent ? 'success' : 'warning'
      )
    } catch (e) {
      showToast(`❌ ${e.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="settings-section">
      <div className="section-head">
        <span className="section-icon">✉️</span>
        <div>
          <h3>이메일 발송 설정 (SMTP)</h3>
          <p>요약 보고서를 이메일로 자동 발송하려면 SMTP 정보를 입력하세요</p>
        </div>
        {status?.configured && <span className="badge-ok">✅ 설정됨</span>}
      </div>

      {status?.configured && (
        <div className="status-card status-card--ok">
          <div className="status-rows">
            <div className="status-row"><span>발신 계정</span><code>{status.smtp_user}</code></div>
            <div className="status-row"><span>SMTP 서버</span><code>{status.smtp_host}</code></div>
          </div>
        </div>
      )}

      <div className="guide-box guide-box--yellow">
        <strong>⚠️ 네이버 메일 사용 시 주의사항</strong>
        <ol>
          <li>네이버 메일 → 환경설정 → POP3/IMAP 설정 → <strong>SMTP 사용 ON</strong></li>
          <li>「외부 앱 접근 허용」 활성화 후 비밀번호 입력</li>
        </ol>
        <a href="https://help.naver.com/service/5640/contents/6946" target="_blank" rel="noreferrer">
          📌 네이버 SMTP 설정 가이드 →
        </a>
      </div>

      <form onSubmit={handleSave} className="settings-form">
        <div className="form-group">
          <label>메일 서비스</label>
          <div className="preset-row">
            {PRESETS.map(p => (
              <button
                key={p.name}
                type="button"
                className={`preset-chip ${form.smtp_host === p.host ? 'active' : ''}`}
                onClick={() => setForm(f => ({ ...f, smtp_host: p.host, smtp_port: p.port }))}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group fg-grow">
            <label>SMTP 서버</label>
            <input type="text" value={form.smtp_host}
              onChange={e => setForm(f => ({ ...f, smtp_host: e.target.value }))} />
          </div>
          <div className="form-group" style={{ width: 100 }}>
            <label>포트</label>
            <input type="number" value={form.smtp_port}
              onChange={e => setForm(f => ({ ...f, smtp_port: +e.target.value }))} />
          </div>
        </div>

        <div className="form-group">
          <label>이메일 주소 (발신자)</label>
          <input type="email" value={form.smtp_user}
            onChange={e => setForm(f => ({ ...f, smtp_user: e.target.value }))}
            placeholder="your@naver.com" />
        </div>

        <div className="form-group">
          <label>비밀번호</label>
          <div className="input-with-toggle">
            <input
              type={showPass ? 'text' : 'password'}
              value={form.smtp_pass}
              onChange={e => setForm(f => ({ ...f, smtp_pass: e.target.value }))}
              placeholder="네이버/Gmail 비밀번호"
            />
            <button type="button" className="eye-btn" onClick={() => setShowPass(v => !v)}>
              {showPass ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        <button type="submit" className="btn-primary-full" disabled={saving}>
          {saving ? <><span className="spinner-sm" />저장 중…</> : '✅ 설정 저장 & 테스트 발송'}
        </button>
      </form>
    </section>
  )
}


/* ─────────────────────────── 통합 Settings 컴포넌트 ─────────────────────────── */
export default function Settings({ onLlmSaved, onSmtpSaved, showToast }) {
  return (
    <div className="settings-container">
      <div className="settings-page-header">
        <h2>⚙️ 서비스 설정</h2>
        <p>AI 요약 기능을 사용하려면 LLM API Key를, 이메일 발송을 사용하려면 SMTP를 설정하세요.</p>
      </div>
      <LlmSection onSaved={onLlmSaved} showToast={showToast} />
      <SmtpSection onSaved={onSmtpSaved} showToast={showToast} />
    </div>
  )
}
