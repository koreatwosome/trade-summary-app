import os
import re
import io
import json
import asyncio
import smtplib
import tempfile
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional

import httpx
import yaml
import pdfplumber
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from openai import OpenAI

app = FastAPI(title="수출입동향 요약 서비스")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── OpenAI 클라이언트 초기화 ───────────────────────────────────────────────
def get_openai_client():
    config_path = os.path.expanduser("~/.genspark_llm.yaml")
    api_key = os.environ.get("OPENAI_API_KEY", "")
    base_url = os.environ.get("OPENAI_BASE_URL", "")
    if os.path.exists(config_path):
        try:
            with open(config_path) as f:
                cfg = yaml.safe_load(f)
            raw_key = cfg.get("openai", {}).get("api_key", api_key)
            # 환경변수 참조 처리
            if raw_key.startswith("${") and raw_key.endswith("}"):
                env_var = raw_key[2:-1]
                raw_key = os.environ.get(env_var, api_key)
            api_key = raw_key
            base_url = cfg.get("openai", {}).get("base_url", base_url)
        except Exception:
            pass
    return OpenAI(api_key=api_key, base_url=base_url)


# ─── 산업통상자원부 보도자료 스크래핑 ────────────────────────────────────────
MOTIE_LIST_URL = "https://www.motie.go.kr/kor/article/ATCL3f49a5a8c"
MOTIE_BASE = "https://www.motie.go.kr"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://www.motie.go.kr/",
}


async def fetch_html(url: str, timeout: int = 20) -> str:
    async with httpx.AsyncClient(headers=HEADERS, timeout=timeout, follow_redirects=True, verify=False) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.text


async def find_latest_export_report() -> Optional[dict]:
    """게시판에서 최신 수출입동향 보도자료를 찾는다"""
    # 여러 페이지를 검색 (최대 5페이지)
    for page in range(1, 6):
        try:
            url = f"{MOTIE_LIST_URL}?pageIndex={page}"
            html = await fetch_html(url)
            soup = BeautifulSoup(html, "html.parser")

            # 테이블 행 탐색
            rows = soup.select("table tbody tr")
            for row in rows:
                title_el = row.select_one("td a")
                if not title_el:
                    continue
                title = title_el.get_text(strip=True)

                # "수출입 동향" 또는 "수출입동향" 키워드 매칭 (ICT, 품목별 등 제외)
                if re.search(r"수출입\s*동향", title) and not re.search(r"ICT|정보통신|품목별", title):
                    # href 확인
                    href = title_el.get("href", "")
                    full_url = None

                    if href.startswith("/") and "view" in href:
                        full_url = MOTIE_BASE + href
                    elif href.startswith("http"):
                        full_url = href
                    else:
                        # onclick에서 article ID 추출: article.view('171550');
                        onclick = title_el.get("onclick", "")
                        m = re.search(r"article\.view\(['\"]?(\d+)['\"]?\)", onclick)
                        if m:
                            article_id = m.group(1)
                            full_url = f"{MOTIE_BASE}/kor/article/ATCL3f49a5a8c/{article_id}/view"

                    # 날짜 정보 (5번째 td)
                    tds = row.select("td")
                    date_str = ""
                    for td in tds:
                        txt = td.get_text(strip=True)
                        if re.match(r"\d{4}-\d{2}-\d{2}", txt):
                            date_str = txt
                            break

                    print(f"Found: {title} | {full_url} | {date_str}")
                    return {
                        "title": title,
                        "url": full_url,
                        "date": date_str,
                    }
        except Exception as e:
            print(f"Page {page} scraping error: {e}")
            continue

    return None


async def extract_report_content(report_info: dict) -> str:
    """보도자료 상세 페이지에서 PDF를 찾아 다운로드하고 텍스트를 추출한다"""
    url = report_info.get("url")
    if not url:
        raise HTTPException(status_code=404, detail="보도자료 URL을 찾을 수 없습니다.")

    html = await fetch_html(url)
    soup = BeautifulSoup(html, "html.parser")

    # viewer 링크 패턴: /attach/viewer/HASH1/HASH2/FILE_HASH
    # down 링크 패턴:   /attach/down/HASH1/HASH2/FILE_HASH
    viewer_links = []
    for a in soup.find_all("a"):
        href = a.get("href", "")
        if "/attach/viewer/" in href:
            viewer_links.append(href)

    print(f"Viewer links found: {viewer_links}")

    # 두 번째 viewer 링크가 PDF (첫 번째는 HWP)
    target_viewer = None
    if len(viewer_links) >= 2:
        target_viewer = viewer_links[1]
    elif viewer_links:
        target_viewer = viewer_links[0]

    if target_viewer:
        # /attach/viewer/HASH1/HASH2/FILE → /attach/down/HASH1/HASH2/FILE
        down_path = target_viewer.replace("/attach/viewer/", "/attach/down/")
        pdf_url = MOTIE_BASE + down_path
        print(f"Attempting PDF download: {pdf_url}")
        try:
            pdf_text = await download_and_extract_pdf(pdf_url)
            if pdf_text and len(pdf_text) > 200:
                return pdf_text
        except Exception as e:
            print(f"PDF extraction failed: {e}")

    # Fallback: KDI 또는 korea.kr
    print("Falling back to KDI/korea.kr...")
    kdi_text = await fetch_from_kdi_or_koreaKr(report_info.get("title", ""))
    if kdi_text and len(kdi_text) > 200:
        return kdi_text

    raise HTTPException(status_code=422, detail="보도자료 본문을 가져오지 못했습니다.")


async def download_and_extract_pdf(pdf_url: str) -> str:
    """PDF URL에서 다운로드 후 텍스트 추출"""
    async with httpx.AsyncClient(headers=HEADERS, timeout=60, follow_redirects=True, verify=False) as client:
        resp = await client.get(pdf_url)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        print(f"PDF response: {resp.status_code}, {len(resp.content)} bytes, {content_type}")

        if resp.status_code != 200 or len(resp.content) < 1000:
            raise ValueError(f"PDF download failed or too small: {resp.status_code}")

    text_parts = []
    with pdfplumber.open(io.BytesIO(resp.content)) as pdf:
        print(f"PDF has {len(pdf.pages)} pages")
        for page in pdf.pages[:25]:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

    full_text = "\n".join(text_parts)
    full_text = re.sub(r"\n{3,}", "\n\n", full_text)
    print(f"PDF extracted: {len(full_text)} chars")
    return full_text[:8000]


async def fetch_from_kdi_or_koreaKr(title: str) -> str:
    """KDI 경제교육 또는 korea.kr에서 수출입동향 내용 가져오기"""
    # KDI 검색
    try:
        search_url = "https://eiec.kdi.re.kr/policy/materialList.do?searchText=%EC%88%98%EC%B6%9C%EC%9E%85+%EB%8F%99%ED%96%A5&pageIndex=1"
        html = await fetch_html(search_url, timeout=15)
        soup = BeautifulSoup(html, "html.parser")
        # 목록에서 최신 수출입동향 찾기
        for a in soup.select("a"):
            link_text = a.get_text(strip=True)
            if re.search(r"\d{4}년.*수출입.*동향", link_text) and not re.search(r"ICT|품목별", link_text):
                href = a.get("href", "")
                detail_url = "https://eiec.kdi.re.kr" + href if href.startswith("/") else href
                detail_html = await fetch_html(detail_url, timeout=15)
                detail_soup = BeautifulSoup(detail_html, "html.parser")
                content = detail_soup.get_text(separator="\n", strip=True)
                if len(content) > 200:
                    return re.sub(r"\n{3,}", "\n\n", content)[:8000]
    except Exception as e:
        print(f"KDI fetch error: {e}")

    # korea.kr 검색
    try:
        search_url = "https://www.korea.kr/briefing/pressReleaseList.do?newsType=C&searchText=%EC%88%98%EC%B6%9C%EC%9E%85+%EB%8F%99%ED%96%A5"
        html = await fetch_html(search_url, timeout=15)
        soup = BeautifulSoup(html, "html.parser")
        for a in soup.select("a"):
            link_text = a.get_text(strip=True)
            if re.search(r"\d{4}년.*수출입.*동향", link_text) and not re.search(r"ICT|품목별", link_text):
                href = a.get("href", "")
                detail_url = "https://www.korea.kr" + href if href.startswith("/") else href
                detail_html = await fetch_html(detail_url, timeout=15)
                detail_soup = BeautifulSoup(detail_html, "html.parser")
                content = detail_soup.get_text(separator="\n", strip=True)
                if len(content) > 200:
                    return re.sub(r"\n{3,}", "\n\n", content)[:8000]
    except Exception as e:
        print(f"korea.kr fetch error: {e}")

    return ""


async def fetch_from_korea_kr() -> Optional[dict]:
    """korea.kr에서 최신 수출입동향 보도자료를 가져온다 (fallback)"""
    try:
        search_url = "https://www.korea.kr/briefing/pressReleaseList.do?newsType=C&searchType=&searchText=%EC%88%98%EC%B6%9C%EC%9E%85+%EB%8F%99%ED%96%A5"
        html = await fetch_html(search_url)
        soup = BeautifulSoup(html, "html.parser")

        for item in soup.select("ul.result-list li, .list-type-news li"):
            title_el = item.select_one("a, strong.title")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            if re.search(r"\d{4}년\s*\d+월\s*수출입\s*동향", title) and not re.search(r"ICT|품목별", title):
                href = title_el.get("href", "") or item.select_one("a")["href"]
                full_url = "https://www.korea.kr" + href if href.startswith("/") else href
                return {"title": title, "url": full_url, "date": "", "source": "korea.kr"}
    except Exception as e:
        print(f"korea.kr scraping error: {e}")
    return None


# ─── AI 요약 생성 ─────────────────────────────────────────────────────────────
SUMMARY_PROMPT = """당신은 경제 보도자료를 쉽게 풀어 쓰는 전문가입니다.
아래 산업통상자원부 수출입동향 보도자료를 읽고, 일반인도 쉽게 이해할 수 있는 형식으로 요약해주세요.

[요약 형식 예시]
<<26년 2월 잠정 수출 데이터>>

- 반도체
> D램 : 전달보다 수출이 크게 늘었습니다. AI 수요 급증과 메모리 가격 상승 덕분입니다.
> 낸드플래시 : 소폭 감소했습니다.

- 자동차
> 전기차 : 미국·유럽 수요 회복으로 전달보다 증가했습니다.

[요약 규칙]
1. 제목은 "<<연도 및 월 수출입 동향>>" 형식으로 작성
2. 품목별로 묶어서 bullet point로 정리
3. 퍼센트 수치는 "크게 증가(+23%)", "소폭 감소(-3%)" 등 직관적 표현으로 변환
4. 달러 금액은 "약 ~억 달러" 형태로 간단히 표현
5. 전문용어는 괄호로 쉬운 설명 추가
6. 전체 요약은 200~400자 내외의 총괄 한줄 요약으로 시작
7. 투자자 관점에서 관련 기업명이 보이면 괄호 안에 함께 표기
8. 마지막에 💡 한 줄 인사이트 추가

보도자료 내용:
{content}"""


def generate_summary(content: str, title: str) -> str:
    """OpenAI API를 통해 요약문 생성"""
    client, model = get_openai_client_with_config()
    prompt = SUMMARY_PROMPT.format(content=content)

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "당신은 경제 데이터를 쉬운 언어로 풀어주는 전문가입니다."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
        max_tokens=2000,
    )
    return response.choices[0].message.content


# ─── 이메일 발송 ──────────────────────────────────────────────────────────────
def send_email_smtp(to_email: str, subject: str, body: str) -> bool:
    """네이버 메일 SMTP를 통해 이메일 발송"""
    # 환경변수에서 SMTP 설정 읽기
    smtp_host = os.environ.get("SMTP_HOST", "smtp.naver.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")

    if not smtp_user or not smtp_pass:
        print("SMTP credentials not configured")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_user
        msg["To"] = to_email

        # HTML 버전
        html_body = body.replace("\n", "<br>").replace("<<", "<strong><<").replace(">>", ">></strong>")
        html_content = f"""
<html><body style="font-family: 'Noto Sans KR', sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #333;">
<div style="background: linear-gradient(135deg, #1a3c5e, #2d6a9f); padding: 24px; border-radius: 12px 12px 0 0;">
  <h1 style="color: white; margin: 0; font-size: 20px;">📊 수출입동향 요약 리포트</h1>
  <p style="color: #b8d4f0; margin: 8px 0 0;">{subject}</p>
</div>
<div style="background: #f8f9fa; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e0e0e0;">
  <pre style="white-space: pre-wrap; font-family: 'Noto Sans KR', sans-serif; line-height: 1.8; color: #333;">{body}</pre>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #888; font-size: 12px;">📌 출처: 산업통상자원부 보도자료 | 자동 요약 서비스</p>
</div>
</body></html>"""

        msg.attach(MIMEText(body, "plain", "utf-8"))
        msg.attach(MIMEText(html_content, "html", "utf-8"))

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"Email send error: {e}")
        return False


# ─── 로컬 저장소 (파일 기반) ──────────────────────────────────────────────────
SAVE_FILE = "/home/user/webapp/backend/saved_reports.json"


def load_saved_reports() -> list:
    if os.path.exists(SAVE_FILE):
        with open(SAVE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_report(report: dict):
    reports = load_saved_reports()
    # 같은 날짜 데이터 업데이트
    existing = next((r for r in reports if r.get("date") == report.get("date") and r.get("title") == report.get("title")), None)
    if existing:
        existing.update(report)
    else:
        reports.insert(0, report)
    # 최대 50개 유지
    reports = reports[:50]
    with open(SAVE_FILE, "w", encoding="utf-8") as f:
        json.dump(reports, f, ensure_ascii=False, indent=2)


# ─── .env 파일 로드 헬퍼 ──────────────────────────────────────────────────────
def _load_env_file():
    env_path = "/home/user/webapp/backend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    if key not in os.environ:
                        os.environ[key] = val


# 시작 시 .env 로드
_load_env_file()


# ─── LLM 설정 파일 경로 ───────────────────────────────────────────────────────
LLM_CONFIG_FILE = "/home/user/webapp/backend/.llm_config.json"


def load_llm_config() -> dict:
    if os.path.exists(LLM_CONFIG_FILE):
        with open(LLM_CONFIG_FILE, "r") as f:
            return json.load(f)
    return {}


def save_llm_config(config: dict):
    with open(LLM_CONFIG_FILE, "w") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def get_openai_client_with_config():
    """저장된 LLM 설정을 사용해 OpenAI 클라이언트 반환"""
    cfg = load_llm_config()
    api_key = cfg.get("api_key", "")
    base_url = cfg.get("base_url", "https://api.openai.com/v1")
    model = cfg.get("model", "gpt-4o-mini")
    if not api_key:
        # 환경변수 fallback
        api_key = os.environ.get("OPENAI_API_KEY", "")
        base_url = os.environ.get("OPENAI_BASE_URL", base_url)
    if not api_key:
        raise ValueError("LLM API Key가 설정되지 않았습니다. 설정 탭에서 API Key를 입력해주세요.")
    return OpenAI(api_key=api_key, base_url=base_url), model


# ─── API 엔드포인트 ────────────────────────────────────────────────────────────

class SummarizeRequest(BaseModel):
    email: Optional[str] = "kore2081@naver.com"
    send_email: bool = False


class SaveRequest(BaseModel):
    title: str
    date: str
    summary: str
    source_url: Optional[str] = ""
    email: Optional[str] = "kore2081@naver.com"
    send_email: bool = False


class EmailRequest(BaseModel):
    title: str
    summary: str
    email: str = "kore2081@naver.com"


class SmtpConfigRequest(BaseModel):
    smtp_host: str = "smtp.naver.com"
    smtp_port: int = 587
    smtp_user: str
    smtp_pass: str


@app.get("/api/health")
async def health():
    return {"status": "ok", "time": datetime.now().isoformat()}


@app.post("/api/scrape-and-summarize")
async def scrape_and_summarize(req: SummarizeRequest, background_tasks: BackgroundTasks):
    """최신 수출입동향 보도자료를 스크래핑하고 AI 요약 생성"""
    # 1. 보도자료 탐색
    report_info = await find_latest_export_report()

    if not report_info:
        # fallback: korea.kr
        report_info = await fetch_from_korea_kr()

    if not report_info:
        raise HTTPException(status_code=404, detail="최신 수출입동향 보도자료를 찾을 수 없습니다.")

    # 2. 본문 추출
    try:
        content = await extract_report_content(report_info)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"보도자료 내용 추출 실패: {str(e)}")

    if not content or len(content) < 100:
        raise HTTPException(status_code=422, detail="보도자료 내용이 너무 짧거나 비어 있습니다.")

    # 3. AI 요약
    try:
        summary = generate_summary(content, report_info["title"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 요약 생성 실패: {str(e)}")

    result = {
        "title": report_info["title"],
        "date": report_info.get("date", ""),
        "source_url": report_info.get("url", ""),
        "summary": summary,
        "raw_content_preview": content[:500],
        "scraped_at": datetime.now().isoformat(),
    }

    # 4. 이메일 발송 (선택적)
    if req.send_email and req.email:
        email_subject = f"📊 {report_info['title']} 요약"
        email_ok = send_email_smtp(req.email, email_subject, summary)
        result["email_sent"] = email_ok
        result["email_to"] = req.email

    return result


@app.post("/api/save-report")
async def save_report_api(req: SaveRequest):
    """요약 보고서 저장"""
    report = {
        "title": req.title,
        "date": req.date,
        "summary": req.summary,
        "source_url": req.source_url,
        "saved_at": datetime.now().isoformat(),
    }
    save_report(report)

    # 이메일 발송
    email_sent = False
    if req.send_email and req.email:
        subject = f"📊 {req.title} 요약"
        email_sent = send_email_smtp(req.email, subject, req.summary)

    return {"success": True, "email_sent": email_sent}


@app.post("/api/send-email")
async def send_email_api(req: EmailRequest):
    """이메일 직접 발송"""
    subject = f"📊 {req.title} - 수출입동향 요약 리포트"
    ok = send_email_smtp(req.email, subject, req.summary)
    if not ok:
        raise HTTPException(
            status_code=500,
            detail="이메일 발송에 실패했습니다. SMTP 설정을 확인하세요."
        )
    return {"success": True, "sent_to": req.email}


@app.get("/api/saved-reports")
async def get_saved_reports():
    """저장된 보고서 목록 반환"""
    return load_saved_reports()


@app.post("/api/smtp-config")
async def set_smtp_config(req: SmtpConfigRequest):
    """SMTP 설정 저장 (환경변수 형태로 런타임 설정)"""
    os.environ["SMTP_HOST"] = req.smtp_host
    os.environ["SMTP_PORT"] = str(req.smtp_port)
    os.environ["SMTP_USER"] = req.smtp_user
    os.environ["SMTP_PASS"] = req.smtp_pass

    # .env 파일에도 저장
    env_path = "/home/user/webapp/backend/.env"
    with open(env_path, "w") as f:
        f.write(f"SMTP_HOST={req.smtp_host}\n")
        f.write(f"SMTP_PORT={req.smtp_port}\n")
        f.write(f"SMTP_USER={req.smtp_user}\n")
        f.write(f"SMTP_PASS={req.smtp_pass}\n")

    # 테스트 발송
    test_ok = send_email_smtp(req.smtp_user, "✅ SMTP 설정 완료", "수출입동향 요약 서비스 SMTP 설정이 완료되었습니다.")
    return {"success": True, "test_email_sent": test_ok}


@app.get("/api/smtp-status")
async def smtp_status():
    """SMTP 설정 상태 확인"""
    _load_env_file()
    user = os.environ.get("SMTP_USER", "")
    return {
        "configured": bool(user and os.environ.get("SMTP_PASS")),
        "smtp_user": user,
        "smtp_host": os.environ.get("SMTP_HOST", "smtp.naver.com"),
    }


# ─── LLM 설정 API ─────────────────────────────────────────────────────────────

class LlmConfigRequest(BaseModel):
    api_key: str
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o-mini"


@app.get("/api/llm-status")
async def llm_status():
    """LLM 설정 상태 확인"""
    cfg = load_llm_config()
    api_key = cfg.get("api_key", "")
    if api_key:
        hint = api_key[:8] if len(api_key) >= 8 else api_key[:4]
        return {
            "configured": True,
            "api_key_hint": hint,
            "model": cfg.get("model", "gpt-4o-mini"),
            "base_url": cfg.get("base_url", "https://api.openai.com/v1"),
        }
    return {"configured": False}


@app.post("/api/llm-config")
async def set_llm_config(req: LlmConfigRequest):
    """LLM API Key 저장 및 테스트"""
    # 테스트 호출
    try:
        test_client = OpenAI(api_key=req.api_key, base_url=req.base_url)
        test_resp = test_client.chat.completions.create(
            model=req.model,
            messages=[{"role": "user", "content": "안녕하세요. 한 문장으로 짧게 답해주세요."}],
            max_tokens=50,
            temperature=0.1,
        )
        test_response = test_resp.choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"API Key 검증 실패: {str(e)}")

    # 검증 성공 시 저장
    save_llm_config({
        "api_key": req.api_key,
        "base_url": req.base_url,
        "model": req.model,
        "saved_at": datetime.now().isoformat(),
    })
    return {"success": True, "test_response": test_response, "model": req.model}


@app.delete("/api/llm-config")
async def delete_llm_config():
    """저장된 LLM API Key 삭제"""
    if os.path.exists(LLM_CONFIG_FILE):
        os.remove(LLM_CONFIG_FILE)
    return {"success": True}


# ─── 프론트엔드 정적 파일 서빙 ──────────────────────────────────────────────────
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
STATIC_DIR = os.path.normpath(STATIC_DIR)

if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # API 요청은 위에서 처리됨; 나머지는 SPA index.html 반환
        file_path = os.path.join(STATIC_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
