import React, { useState, useEffect } from 'react'
import './SmtpConfig.css'

export default function SmtpConfig({ onSaved, showToast }) {
  const [form, setForm] = useState({
    smtp_host: 'smtp.naver.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
  })
  const [saving, setSaving] = useState(false)
  const [showPass, setShowPass] = useState(false)

  useEffect(() => {
    // 현재 설정 로드
    fetch('/api/smtp-status')
      .then(r => r.json())
      .then(data => {
        if (data.smtp_user) {
          setForm(prev => ({
            ...prev,
            smtp_host: data.smtp_host || 'smtp.naver.com',
            smtp_user: data.smtp_user,
          }))
        }
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.smtp_user || !form.smtp_pass) {
      showToast('이메일과 비밀번호를 입력해주세요', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/smtp-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      onSaved(true)
      if (data.test_email_sent) {
        showToast('✅ 설정 완료! 테스트 이메일이 발송되었습니다', 'success')
      } else {
        showToast('✅ 설정이 저장되었습니다 (테스트 이메일 발송 실패)', 'warning')
      }
    } catch (e) {
      showToast('설정 저장에 실패했습니다', 'error')
    } finally {
      setSaving(false)
    }
  }

  const presets = [
    { name: '네이버', host: 'smtp.naver.com', port: 587 },
    { name: 'Gmail', host: 'smtp.gmail.com', port: 587 },
    { name: '다음', host: 'smtp.daum.net', port: 465 },
    { name: '네이버(SSL)', host: 'smtp.naver.com', port: 465 },
  ]

  return (
    <div className="smtp-config">
      <div className="config-header">
        <div className="config-icon">✉️</div>
        <div>
          <h2>이메일 발송 설정</h2>
          <p>수출입동향 요약을 이메일로 자동 발송하려면 SMTP 정보를 입력하세요</p>
        </div>
      </div>

      {/* 안내 박스 */}
      <div className="guide-box">
        <h3>⚠️ 네이버 메일 사용 시 주의사항</h3>
        <ol>
          <li>네이버 메일 → 환경설정 → POP3/IMAP 설정 → <strong>SMTP 사용 ON</strong></li>
          <li>비밀번호는 <strong>네이버 로그인 비밀번호</strong>를 입력하세요</li>
          <li>보안 설정에서 <strong>외부 앱 접근 허용</strong>을 설정하세요</li>
        </ol>
        <div className="guide-links">
          <a href="https://help.naver.com/service/5640/contents/6946" target="_blank" rel="noreferrer">
            📌 네이버 SMTP 설정 가이드
          </a>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="config-form">
        {/* SMTP 프리셋 */}
        <div className="form-group">
          <label>빠른 설정</label>
          <div className="preset-btns">
            {presets.map(p => (
              <button
                key={p.name}
                type="button"
                className={`preset-btn ${form.smtp_host === p.host && form.smtp_port === p.port ? 'active' : ''}`}
                onClick={() => setForm(prev => ({ ...prev, smtp_host: p.host, smtp_port: p.port }))}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="smtp-host">SMTP 서버</label>
            <input
              id="smtp-host"
              type="text"
              value={form.smtp_host}
              onChange={e => setForm(prev => ({ ...prev, smtp_host: e.target.value }))}
              placeholder="smtp.naver.com"
            />
          </div>
          <div className="form-group form-group--small">
            <label htmlFor="smtp-port">포트</label>
            <input
              id="smtp-port"
              type="number"
              value={form.smtp_port}
              onChange={e => setForm(prev => ({ ...prev, smtp_port: parseInt(e.target.value) }))}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="smtp-user">이메일 주소 (발신자)</label>
          <input
            id="smtp-user"
            type="email"
            value={form.smtp_user}
            onChange={e => setForm(prev => ({ ...prev, smtp_user: e.target.value }))}
            placeholder="your@naver.com"
          />
        </div>

        <div className="form-group">
          <label htmlFor="smtp-pass">비밀번호 (앱 비밀번호)</label>
          <div className="pass-input-wrap">
            <input
              id="smtp-pass"
              type={showPass ? 'text' : 'password'}
              value={form.smtp_pass}
              onChange={e => setForm(prev => ({ ...prev, smtp_pass: e.target.value }))}
              placeholder="네이버 비밀번호 또는 앱 비밀번호"
            />
            <button
              type="button"
              className="show-pass-btn"
              onClick={() => setShowPass(!showPass)}
            >
              {showPass ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        <button type="submit" className="submit-btn" disabled={saving}>
          {saving ? (
            <><span className="btn-spinner-sm" />저장 중...</>
          ) : (
            '✅ 설정 저장 및 테스트 발송'
          )}
        </button>
      </form>
    </div>
  )
}
