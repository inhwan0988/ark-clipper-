# ARK Clipper

> 🎬 YouTube 롱폼 영상에서 후킹되는 부분을 AI가 자동으로 찾아 쇼츠로 만들어주는 **로컬 도구**

![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Made with](https://img.shields.io/badge/made_with-Next.js_+_Claude_AI-black.svg)

---

## ✨ 주요 기능

- 🤖 **AI 자동 후킹 분석** (Claude AI) - 5~6개 후킹 구간 자동 추출
- 🎙️ **한국어 음성 인식** (Whisper large-v3, GPU 가속) - 단어별 타임스탬프
- 📱 **9:16 세로형 + 16:9 레터박스** 두 가지 레이아웃 (클립마다 따로 설정 가능)
- 🎨 **자막/제목/채널명 디자인 커스텀** - 폰트/색상/위치/외곽선/배경 자유 조정
- ✂️ **타임라인 에디터** - 영상 보면서 시작/끝 시간 정밀 조정 + 줌
- 🔥 **후킹 제목 자동 생성** - 8가지 검증된 후킹 패턴 적용
- 📥 **개별 MP4 / 전체 ZIP 다운로드**

---

## 🛠️ 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Next.js 16 (App Router) + React 19 + TailwindCSS 4 |
| 백엔드 | Next.js API Routes (Node.js) |
| DB | SQLite (better-sqlite3) |
| AI 분석 | Anthropic Claude API (`@anthropic-ai/sdk`) |
| 음성 인식 | faster-whisper (Python, CUDA) |
| 영상 처리 | FFmpeg + ASS 자막 burn-in |
| YouTube | yt-dlp |
| 패키징 | PowerShell 빌드 스크립트 (휴대용 ZIP) |

---

## 🚀 실행 방법

### 빠른 시작 (휴대용 번들, 비개발자용)

1. [Releases](../../releases)에서 `ARK_Clipper_Portable.zip` 다운로드 (~10GB)
2. 압축 풀기
3. `start.bat` 더블클릭
4. 브라우저 자동으로 열림 → 우상단에 본인 API 키 입력
5. 사용 시작

### 소스에서 직접 실행 (개발자/협업자용)

#### 필수 조건

- **Windows 10/11 64bit**
- **Node.js 22.x LTS** ([설치](https://nodejs.org))
- **FFmpeg** (`winget install Gyan.FFmpeg` 후 재로그인)
- **Python 3.12+** (winget 또는 직접 설치)
- **NVIDIA GPU + CUDA** (선택, 없으면 음성 인식 CPU 모드로 매우 느림)

#### 설치

```powershell
git clone https://github.com/<USER>/ark-clipper.git
cd ark-clipper

# 자동 설치 (1회):
#  - npm install
#  - Python venv 생성 (C:\arc-clipper-venv)
#  - faster-whisper + CUDA 라이브러리
#  - yt-dlp.exe 다운로드
.\install.bat
```

#### 실행

```powershell
# 옵션 1: 더블클릭으로 실행
.\start.bat

# 옵션 2: 직접 실행
npm run dev
```

브라우저: http://localhost:3000

#### 휴대용 번들 빌드 (개발자용)

```powershell
.\build-portable.bat
```

→ `..\ARK_Clipper_Portable\` 폴더 생성 (Node.js + FFmpeg + Python + Whisper 모델 + 앱 모두 포함, ~10GB)

---

## 🔑 환경변수

API 키는 두 가지 방법으로 입력 가능:

### 권장: 앱 UI에서 입력
- 앱 실행 → 홈 화면 우상단 "Anthropic API 키" 입력
- 브라우저 localStorage에 저장 (외부 노출 없음)
- 사용자별로 다른 키 사용 가능

### 대안: `.env.local` 파일
`.env.example`을 복사해서 `.env.local`로 이름 변경 후 값 입력:

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | ✅ | Claude API 키 (`sk-ant-api03-...`) |
| `ARC_PYTHON_EXE` | ❌ | Python 가상환경 python.exe 경로 (기본: `C:\arc-clipper-venv\Scripts\python.exe`) |
| `ARC_YTDLP` | ❌ | yt-dlp.exe 경로 (기본: `<프로젝트>/bin/yt-dlp.exe`) |
| `ARC_PORTABLE_ROOT` | ❌ | 휴대용 번들 루트 (start.bat이 자동 설정) |

---

## 🌐 외부 API 의존성

| 서비스 | 용도 | 비용 |
|--------|------|------|
| **Anthropic Claude API** | 후킹 구간 + 제목 분석 | 영상 1개당 약 $0.05~$0.20 |
| **YouTube** (yt-dlp) | 영상 다운로드 | 무료 |
| **HuggingFace Hub** | Whisper 모델 첫 다운로드 (3GB, 1회만) | 무료 |

> 💡 모든 영상 처리(전사, 클립 생성)는 **로컬**에서 실행됩니다. 외부에 영상 파일 전송 없음.
> Claude API에는 전사 텍스트(자막)만 전송됨.

---

## 🛠️ 사용 흐름

1. **API 키 입력** (홈 화면, 1회만)
2. **저장 폴더 선택** (선택사항, Windows 폴더 다이얼로그)
3. **YouTube URL 붙여넣기** → "쇼츠 만들기"
4. **자동 처리**: 다운로드 → 음성 인식 → AI 분석 (1~5분)
5. **AI 추천 후킹 5~6개** 카루셀로 검토 (좌우 화살표)
6. **상세 편집**: 영상 보면서 시작/끝 시간 조정, 제목/색상/자막 디자인
7. **클립 생성**: 9:16 세로형 자동 변환 + 자막 합성
8. **MP4 다운로드** 또는 **전체 ZIP 다운로드**

---

## 📂 프로젝트 구조

```
ark-clipper/
├── src/
│   ├── app/
│   │   ├── page.tsx              # 홈 (URL 입력, API 키 설정)
│   │   ├── project/[id]/         # 프로젝트 상세 페이지
│   │   └── api/                  # API 라우트
│   │       ├── analyze/          # Claude AI 분석
│   │       ├── clip/             # 클립 생성 (FFmpeg)
│   │       ├── download/         # YouTube 다운로드 (yt-dlp)
│   │       ├── transcribe/       # 음성 인식 (Whisper)
│   │       ├── projects/         # CRUD
│   │       └── system/pick-folder # 폴더 선택 다이얼로그
│   ├── components/               # React 컴포넌트
│   └── lib/                      # 비즈니스 로직
│       ├── claude-analyzer.ts    # AI 후킹 분석
│       ├── db.ts                 # SQLite
│       ├── ffmpeg-ops.ts         # 영상 처리
│       ├── ytdlp.ts              # YouTube 다운로드
│       ├── whisper.ts            # 음성 인식 호출
│       ├── subtitle-gen.ts       # ASS 자막 생성
│       └── paths.ts              # 경로 관리
├── python/
│   └── transcribe.py             # Python Whisper 스크립트
├── scripts/
│   ├── setup.ps1                 # 환경 자동 설치
│   └── build-portable.ps1        # 휴대용 번들 빌드
├── install.bat                   # 1회 설치 (setup.ps1 호출)
├── start.bat                     # 실행
├── build-portable.bat            # 휴대용 번들 빌드 진입점
└── .env.example                  # 환경변수 템플릿
```

---

## 🔒 개인정보 / 보안

- API 키는 본인 브라우저 localStorage에만 저장됨 (서버 X, 외부 공유 X)
- 모든 영상/자막/클립 파일은 본인 PC에 저장됨
- `.gitignore`에 `.env*`, `workspace/`, `data/` 모두 포함됨 → 실수로 키/파일 커밋 불가
- Claude API 호출 시에만 전사 텍스트가 외부(Anthropic)로 전송됨
