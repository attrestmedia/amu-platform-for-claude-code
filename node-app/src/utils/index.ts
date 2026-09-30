import { isProduct } from "./common";

// allmyuniverse.com 콘솔 메시지 - production에서만 표시
(function () {
  // 브라우저 환경에서만 실행
  if (typeof window !== "undefined" && isProduct) {
    // 기본 스타일
    const conssoleStyles = {
      title: ["color: hsl(220, 70%, 60%)", "font-size: 14px", "font-weight: bold"].join(";"),
      subtitle: ["color: hsl(180, 50%, 50%)", "font-size: 14px", "font-weight: bold"].join(";"),
      link: ["color: hsl(320 70% 60%)", "font-size: 12px", "font-weight: bold"].join(";"),
      box: [
        "padding: 10px",
        "font-size: 14px",
        "font-weight: bold",
        "background-color: #111111",
        "border-radius: 5px",
        "margin: 5px 0",
      ].join(";"),
      ascii: ["color: hsl(280, 70%, 60%)", "font-size: 12px", "line-height: 14px", "font-family: monospace"].join(";"),
      join: [`color: hsl(360, 70%, 60%)`, "font-size: 12px", "font-weight: bold"].join(";"),
    };

    // 아스키 아트
    const asciiArt = `%c
    AAAAAAAAA          MMMMMMMM             MMMMMMMM      UUUUU         UUUUU
  AAAAAAAAAAAAAA     MMMMMMMMMMMM         MMMMMMMMMMMM    UUUUU         UUUUU
AAAAAAAAAAAAAAAAA    MMMMMMMMMMMM         MMMMMMMMMMMM    UUUUU         UUUUU
AAAA         AAAA    MMMMM    MMMMM     MMMMM    MMMMM    UUUUU         UUUUU
AAAA         AAAA    MMMM      MMMMM   MMMMM      MMMM    UUUUU         UUUUU
AAAAAAAAAAAAAAAAA    MMMM       MMMM   MMMM       MMMM    UUUUU         UUUUU
AAAAAAAAAAAAAAAAA    MMMM       MMMMMMMMMMM       MMMM    UUUUU         UUUUU
AAAA         AAAA    MMMM       MMMMMMMMMMM       MMMM    UUUUU         UUUUU
AAAA         AAAA    MMMM        MMMMMMMMM        MMMM    UUUUU         UUUUU
AAAA         AAAA    MMMM                         MMMM     UUUUUUUUUUUUUUUUU 
AAAA         AAAA    MMMM                         MMMM      UUUUUUUUUUUUUUU  

%cAllMyUniverse.com - %cDigital playground for my universe!

%c👉 LinkedIn:  %chttps://www.linkedin.com/in/allmyuniverse
%c👉 Instagram: %chttps://www.instagram.com/allmyuniverse_com
%c👉 Thread:    %chttps://www.threads.net/@allmyuniverse_com
%c👉 Blog:      %chttps://blog.naver.com/rihodad`;

    // 콘솔 출력
    console.log(
      asciiArt,
      conssoleStyles.ascii,
      conssoleStyles.title,
      conssoleStyles.subtitle,
      conssoleStyles.link,
      "font-size: 12px",
      conssoleStyles.link,
      "font-size: 12px",
      conssoleStyles.link,
      "font-size: 12px",
      conssoleStyles.link,
      "font-size: 12px"
    );
    console.log("%c👋 Welcome to my digital universe!", conssoleStyles.box);
    console.log("\n%c🎮 Still exploring? Join our community!\n", conssoleStyles.join);
  }
})();
