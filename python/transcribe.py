#!/usr/bin/env python3
"""
ArcClipper 음성 전사 스크립트
faster-whisper로 한국어 음성을 텍스트로 변환합니다.
NVIDIA GPU(CUDA) 우선 시도, 실패 시 CPU로 폴백.
"""

import argparse
import json
import sys
import os
import wave

def get_audio_duration(path):
    try:
        with wave.open(path, 'rb') as wf:
            return wf.getnframes() / float(wf.getframerate())
    except Exception:
        return 0.0

def add_cuda_dll_dirs():
    """nvidia-cublas-cu12, nvidia-cudnn-cu12 DLL 경로 추가 (Windows)
    ctranslate2는 LoadLibrary를 직접 사용하므로 add_dll_directory + PATH 둘 다 필요.
    이 함수는 반드시 faster_whisper를 import 하기 전에 호출되어야 함."""
    if sys.platform != 'win32':
        return
    import site
    bin_dirs = []
    for sp in site.getsitepackages() + [site.getusersitepackages()]:
        for sub in ('cublas', 'cudnn', 'cuda_nvrtc', 'cuda_runtime'):
            bin_dir = os.path.join(sp, 'nvidia', sub, 'bin')
            if os.path.isdir(bin_dir):
                bin_dirs.append(bin_dir)

    for bd in bin_dirs:
        try:
            os.add_dll_directory(bd)
        except Exception:
            pass

    # PATH 맨 앞에 추가 → LoadLibrary가 기본 검색 경로로 사용
    if bin_dirs:
        os.environ['PATH'] = os.pathsep.join(bin_dirs) + os.pathsep + os.environ.get('PATH', '')
        print(f"[cuda] {len(bin_dirs)} DLL dirs added to PATH", file=sys.stderr)

def load_model(name, device, compute_type):
    from faster_whisper import WhisperModel
    # 휴대용 번들에서 사전 다운로드된 모델 폴더 사용 (있으면)
    portable_root = os.environ.get('ARC_PORTABLE_ROOT')
    if portable_root:
        local_model = os.path.join(portable_root, 'hf-models', f'faster-whisper-{name}')
        if os.path.isdir(local_model):
            print(f"Using local model: {local_model}", file=sys.stderr)
            return WhisperModel(local_model, device=device, compute_type=compute_type)
    return WhisperModel(name, device=device, compute_type=compute_type)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="large-v3")
    parser.add_argument("--language", default="ko")
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    # Try GPU first, then CPU fallback
    add_cuda_dll_dirs()

    model = None
    device_used = None

    if args.device in ("auto", "cuda"):
        try:
            print("Trying CUDA (GPU)...", file=sys.stderr)
            model = load_model(args.model, "cuda", "float16")
            device_used = "cuda"
        except Exception as e:
            print(f"[warn] CUDA failed: {e}", file=sys.stderr)
            if args.device == "cuda":
                sys.exit(2)

    if model is None:
        print("Falling back to CPU (this will be slow)...", file=sys.stderr)
        # On CPU, large-v3 is very slow. Auto-downgrade to medium.
        model_name = args.model if args.model in ("tiny", "base", "small", "medium") else "medium"
        model = load_model(model_name, "cpu", "int8")
        device_used = "cpu"

    print(f"Model loaded on {device_used}", file=sys.stderr)

    total_duration = get_audio_duration(args.input)
    print(f"Transcribing... (audio duration: {total_duration:.1f}s)", file=sys.stderr)

    segments_data = []
    # 정확도 최우선 설정:
    #  - beam_size=10: 빔 서치 폭 확대 (기본 5)
    #  - best_of=5: 여러 샘플링 중 최선 선택
    #  - temperature=0.0: 결정적 출력 (환각 방지)
    #  - condition_on_previous_text=True: 직전 컨텍스트 활용
    #  - vad_filter + 적절한 minSilence: 무음 구간 정밀 분리
    #  - patience=2: beam search 인내값 (정확도 향상)
    segments, info = model.transcribe(
        args.input,
        language=args.language,
        word_timestamps=True,
        beam_size=10,
        best_of=5,
        patience=2.0,
        temperature=0.0,
        condition_on_previous_text=True,
        compression_ratio_threshold=2.4,
        log_prob_threshold=-1.0,
        no_speech_threshold=0.5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500, threshold=0.4),
    )

    last_pct = 0
    for segment in segments:
        words_data = []
        if segment.words:
            for word in segment.words:
                words_data.append({
                    "word": word.word.strip(),
                    "start": round(word.start, 3),
                    "end": round(word.end, 3),
                })

        segments_data.append({
            "start": round(segment.start, 3),
            "end": round(segment.end, 3),
            "text": segment.text.strip(),
            "words": words_data,
        })

        if total_duration > 0:
            pct = min(99.0, (segment.end / total_duration) * 100)
            if pct - last_pct >= 1:
                print(f"PROGRESS:{pct:.1f}", file=sys.stderr, flush=True)
                last_pct = pct

    result = {
        "segments": segments_data,
        "language": info.language,
        "duration": info.duration,
        "device_used": device_used,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print("PROGRESS:100.0", file=sys.stderr, flush=True)
    print(f"Done: {len(segments_data)} segments on {device_used}", file=sys.stderr)

if __name__ == "__main__":
    main()
