# "기사 초안" 작성을 위한 format_converter 문법 가이드

## 1) 기본 규칙

- 섹션 분리: `=====`
- 메타 라인: `#TITLE`, `#TAG`, `#AUTHOR`, `#THUMB`, `#:`
- 블록 지시어: 시작 후 `#END`로 종료
- 인라인 지시어: `[{text}@{prop}]`
- 지원 마크다운:
  > 링크: `[text](url)`
  > 이미지: `![alt](src)` / `![alt](src "title")`
  > 코드펜스: ` ```lang ... ``` `
  > 자동 리스트(연속 2줄 이상): `- ...`, `1. ...`, `2) ...`, `(3) ...`
- 글 작성 시 기본적으로 마크다운 문법을 사용하고, 글의 흐름 상 특별한 포맷이 필요한 경우에만 커스텀 문법 사용
- **본문에 `# 제목`(H1)을 쓰지 않는다.** H1은 JSON 메타의 `title`이 담당하며 WordPress 테마가 그린다. 본문 제목은 `## `(H2)부터 시작한다

---

## 2) 메타 지시어

- `#TITLE {title_text}`
- `#TAG {tag1}, {tag2}, ...`
- `#AUTHOR {author_name}` (메타로만 사용, 본문 미출력)
- `#THUMB {thumb_path}` (메타로만 사용, 본문 미출력)
- `#: {description_text}` (주석/설명 라인)

---

## 3) 블록 지시어

### 3-1. 제목(H2~H5)

> **출력 범위는 H2~H5뿐이다.** 변환기는 `# `(H1)를 **H2로 올리고** `###### `(H6)를 **H5로 내려서** 받는다(2026-09-12 패치). 즉 본문에 `# {title}`을 쓰면 오류로 멈추는 것이 아니라 **제목이 H2로 한 번 더 반복된 기사가 나온다.** 쓰지 않는 것이 유일한 해결이다.
> 2026-09-12 이전 변환기는 이 두 레벨을 아예 받지 않아 `#`가 붙은 **평문 문단**으로 내보냈다. 발행 게이트 `hasNoRawMarkdownHeading`이 그 잔여 마커를 차단하므로, 다른 경로로 본문에 남아도 SEO 검사에서 발행이 막힌다.
> 근거: 2026-09-11 리뉴얼 4건이 본문 첫 줄 `# {title}` 때문에 제목이 두 번 노출된 채 발행됨 — `.agent/docs/project/2026/09/20260912_170942__magazine-renewal-raw-h1-leak-converter-and-gate-analysis.md`

```txt
##
{h2_title}

###
{h3_title}

####
{h4_title}

#####
{h5_title}
```

또는 인라인 형태:

```txt
#H2 {h2_title}
#H3 {h3_title}
#H4 {h4_title}
#H5 {h5_title}
```

H3 id 지정:

```txt
### id={id_name}
{h3_title}
```

### 3-2. 공백/구분

```txt
#SPACE
#HR
```

### 3-3. UL 목록

**#UL 사용 시**: "-" 없이 라인으로만 구분

```txt
#UL type={list_type}&title={list_title}
{list_text}
#END
```

또는

**#UL 미사용 시**: "-"로 구분하여 라인별로 입력

```txt
- {list_text}
- {list_text}
```

- `type` 예시: `dot, dash, number, bracket, lower, upper, roman-lower, roman-upper, ring, dollar, won, list, square, diamond, four-diamonds, star, ref, arrow, arrows, four-colons`

### 3-4. DL 목록

```txt
#DL type={list_type}
- {dt_text}
-- {dd_text}
#END
```

### 3-5. 이미지

단일 이미지(`#IMG`):

```txt
#IMG src={img_path}&source={source_text}&url={source_url}&class={class_name}&type={img_type}
```

- `type`: `pc, mobile, fullscreen, ...`
- `class`: `align-left, align-center, align-right, bordered, hide-caption, ...`

마크다운 이미지(단일 라인):

```txt
![이미지 설명](이미지_URL_또는_경로)
![이미지 설명](이미지_URL_또는_경로 "마우스 오버 제목")
```

이미지 그룹 블록:

```txt
#IMG title={group_title}&type={group_type}&class={group_class}&id={group_id}
image_path 또는 ![alt](src)
image_path 또는 ![alt](src "title")
#END
```

### 3-6. 인용

블록 인용:

```txt
#BLOCKQUOTE source={source_text}&url={source_url}&type={type_name}
{blockquote_sentence}
{blockquote_sentence}
#END
```

단일 라인 인용:

```txt
#! {blockquote_sentence}&source={source_text}&type={type_name}
```

또는 단순 인용일 경우 마크다운 문법 사용:

```txt
>
```

- `type` 예시: `comma(콤마 부호 추가), prompt(프롬프트 스타일), jumbo(글자를 더 크게), hash(해시 부호 추가), gradient(그라데이션 효과 추가), talk(말 풍선 스타일 - 오른쪽), talk-left(말 풍선 스타일 - 왼쪽)`
- `talk`, `talk-left`는 `#BLOCKQUOTE`에서만 적용
- `<`, `>` 포함 문장은 `#!` 대신 `#BLOCKQUOTE` 권장

### 3-7. 코드 블록

`#PRE` 형식:

```txt
#PRE title={title_text}&file={file_name}&lang={language_type}&class={pre_class}&type={pre_type}
{code}
#END
```

- `class`: `viewer`
- `type`: `html, css, script, result, no-numbers`
- `lang`: ace mode 이름 사용
  - 예: `css, scss, html, django, python, gitignore, java, javascript, json, jsp, kotlin, mysql, php, typescript, powershell, plain_text, text`

마크다운 코드펜스도 지원:

````txt
```python
print("hello")
```
````

### 3-8. 커스텀 DIV

```txt
#DIV class={class_name}&id={id_name}&type={container_type}
{content}
#END
```

응용 샘플:

```txt
#DIV class=with-header-container
#_header_# {header_text}
{text}
#END
```

```txt
#DIV class=grid-container col-{num}
#UL
{text}
#END
#END
```

### 3-9. 테이블

```txt
#TABLE div={split_char}&type={type}&caption={table_caption}&id={id}&cols={unit, unit, ...}&class={class_name}&numbering={true}
header1 | header2 | ...
value1  | value2  | ...
#END
```

- 기본 분할 문자: `|`
- `type` 예시: `responsive`, (필요 시) `ppt-cut`

### 3-10. 영상(MOV 통합)

YouTube:

```txt
#MOV type=youtube&id={youtube_id}
```

동영상:

```txt
#MOV type=video&src={mov_path}&source={source}
```

### 3-11. FAQ(Q/A)

```txt
#Q {question}
#A {answer}
```

---

## 4) 인라인 지시어

### 4-1. 링크(기본형)

```txt
[word](url_path)
```

또는

```txt
[{word}@link={url_path}]
```

- 마크다운 형식의 문법 사용 권장

### 4-2. data-\* 계열

```txt
[{word}@data-footnote={description}]
[{stock_name}@data-stock={ticker}]
[{word}@data-type={prop}]
```

- `data-type` 예시: `ref, menu, simbol, calc, asset`

### 4-3. DOM(표준 HTML 태그)

```txt
[{word}@code], [{word}@var], [{word}@i], [{word}@strong], [{word}@b], [{word}@em], [{word}@mark], [{word}@kbd]
[br]
```

---

## 5) P/LI 클래스 단축 문법

```txt
#_{class_name}_# {content_text}
```

- `#_first_#`: 첫 글자 강조
- `#_source_#`: 출처 스타일
- `#_quote_#`: 인용 스타일
- `#_left_#`: 왼쪽 정렬
- `#_right_#`: 오른쪽 정렬
- `#_center_#`: 중앙 정렬

---

## 6) 빠른 샘플

```txt
#TITLE 샘플 문서
#TAG automation, wp
=====

##
문단 제목

![샘플 이미지](/images/sample.jpg "hover title")

#IMG title=톤 비교&type=tones&class=compare-grid
/images/a.jpg
![중립 톤](/images/b.jpg)
#END

#MOV type=youtube&id=dQw4w9WgXcQ

#UL type=dot&title=핵심 요약
항목 1
항목 2
#END

#Q 질문은 어떻게 작성하나요?
#A #Q / #A를 연속으로 작성하면 됩니다.
```

**참고 자료가 하나일 경우**

```txt
#_source_# 참고 자료: writer, [title](link)
```

**참고 자료가 여러개일 경우**

```txt
#### 참고 자료:

- writer, [title](link)
- writer, [title](link)
```
