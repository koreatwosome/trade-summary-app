# 📊 수출입동향 요약 서비스

산업통상자원부 보도자료 게시판을 자동 크롤링하여 매월 발표되는 **수출입동향 보도자료**를 AI가 읽기 쉬운 형태로 요약해주는 웹 앱입니다.

## ✨ 주요 기능

- 🔍 **자동 크롤링**: 버튼 클릭 한 번으로 산업통상자원부 보도자료 게시판에서 최신 수출입동향 탐색
- 📄 **PDF 직접 파싱**: 보도자료 첨부 PDF를 다운로드하여 전문 텍스트 추출
- 🤖 **AI 요약**: LLM(OpenAI 호환)이 복잡한 수치를 쉬운 언어로 변환
- ✏️ **편집 가능**: 생성된 요약을 직접 수정 가능
- 💾 **저장 기능**: 보고서를 로컬에 저장 및 이력 관리
- 📧 **이메일 발송**: SMTP 설정 후 요약본을 이메일로 자동 발송

## 🏗️ 기술 스택

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite |
| Backend | FastAPI (Python) |
| Scraping | httpx + BeautifulSoup4 |
| PDF 파싱 | pdfplumber |
| AI 요약 | OpenAI API (호환) |
| 이메일 | smtplib (SMTP) |

## 🚀 실행 방법

### 백엔드

```bash
cd backend
pip install fastapi uvicorn httpx beautifulsoup4 pdfplumber openai requests lxml pyyaml
python main.py
# → http://localhost:8000
```

### 프론트엔드

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

## ⚙️ 환경 설정

### LLM API (AI 요약)
`backend/.env` 또는 환경변수:
```
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
```

### 이메일 발송 (SMTP)
앱 내 **⚙️ 이메일 설정** 탭에서 설정:
- SMTP 서버: `smtp.naver.com` (587)
- 이메일/비밀번호 입력 후 저장

## 📁 프로젝트 구조

```
webapp/
├── backend/
│   ├── main.py          # FastAPI 서버 (스크래핑, AI 요약, 이메일)
│   └── saved_reports.json  # 저장된 보고서 (자동 생성)
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── components/
    │   │   ├── Header.jsx
    │   │   ├── ScrapePanel.jsx    # 메인 분석 버튼
    │   │   ├── SummaryViewer.jsx  # 요약 뷰어/편집기
    │   │   ├── SavedReports.jsx   # 저장 보고서 목록
    │   │   ├── SmtpConfig.jsx     # 이메일 설정
    │   │   └── Toast.jsx
    │   └── styles/
    └── index.html
```

## 📌 출처

- 산업통상자원부 보도·참고자료 게시판: https://www.motie.go.kr/kor/article/ATCL3f49a5a8c
