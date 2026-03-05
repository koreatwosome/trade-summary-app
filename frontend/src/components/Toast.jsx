import React, { useEffect, useRef } from 'react'
import './Toast.css'

export default function Toast({ message, type, id }) {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  }

  return (
    <div key={id} className={`toast toast--${type}`}>
      <span className="toast-icon">{icons[type] || icons.info}</span>
      <span className="toast-message">{message}</span>
    </div>
  )
}
