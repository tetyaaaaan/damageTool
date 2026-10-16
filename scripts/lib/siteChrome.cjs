"use strict";

// Site-wide copy, destinations, and shell markup are authored only here.
const site = {
    brand: "tetinet",
    description: "ゲーム・ツール・個人制作物をまとめるサイト。",
    logo: "/games/images/logo/tetinet_icon_purple_orange.webp",
    footerLogo: "/games/images/logo/tetinet_icon_white.webp",
    copyrightYear: 2026,
    rights: "All rights reserved.",
    navigationLabel: "メインナビゲーション",
    themeLabel: "テーマを切り替える",
    links: {
        home: {label:"ホーム",url:"/"},
        tools: {label:"計算ツール",url:"/games/"},
        about: {label:"このサイトについて",url:"/about/"},
        guides: {label:"使い方ガイド",url:"/guides/"},
        updates: {label:"更新履歴",url:"/updates/"},
        faq: {label:"よくある質問",url:"/faq/"},
        contact: {label:"お問い合わせ",url:"/contact/"},
        terms: {label:"利用条件・免責事項",url:"/terms/"},
        privacy: {label:"プライバシーポリシー",url:"/privacy/"},
        references: {label:"参考リンク",url:"/links/"},
        sitemap: {label:"サイトマップ",url:"/sitemap/"}
    },
    navigation: ["home","tools","about"],
    footerGroups: [
        {label:"コンテンツ",links:["home","tools","about"]},
        {label:"サポート",links:["guides","updates","faq","contact"]},
        {label:"その他",links:["terms","privacy","references","sitemap"]}
    ],
    social: {url:"https://x.com/tetinet_jp",label:"Xでtetinet_jpを開く"}
};
const escape = value => String(value).replace(/[&<>"']/g, char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
function renderHeader(currentPath, config = site) {
    const nav = config.navigation.map(key=> {
        const link=config.links[key];
        const current=link.url === "/" ? currentPath === "/" : currentPath.startsWith(link.url);
        return `<a href="${escape(link.url)}"${current?' aria-current="page"':''}>${escape(link.label)}</a>`;
    }).join("\n        ");
    return `<header class="teti-site-header">
  <div class="teti-container teti-header-inner">
    <a class="teti-brand" href="${escape(config.links.home.url)}" aria-label="${escape(config.brand)} ${escape(config.links.home.label)}">
      <img src="${escape(config.logo)}" alt="" width="40" height="40"><span>${escape(config.brand)}</span>
    </a>
    <nav class="teti-nav" id="tetiMainNavigation" aria-label="${escape(config.navigationLabel)}">
        ${nav}
    </nav>
    <button class="teti-theme-toggle" type="button" data-theme-toggle aria-label="${escape(config.themeLabel)}"><span class="theme-moon" aria-hidden="true">☾</span><span class="theme-sun" aria-hidden="true">☀</span></button>
  </div>
</header>`;
}
function renderFooter(config = site) {
    const groups=config.footerGroups.map(group=>`<div class="teti-footer-col"><h3>${escape(group.label)}</h3>${group.links.map(key=>`<a href="${escape(config.links[key].url)}">${escape(config.links[key].label)}</a>`).join("")}</div>`).join("\n      ");
    return `<footer class="teti-site-footer">
  <div class="teti-container">
    <div class="teti-footer-grid">
      <div class="teti-footer-col">
        <div class="teti-footer-brand"><img src="${escape(config.footerLogo)}" alt="" width="34" height="34"><span>${escape(config.brand)}</span></div>
        <p>${escape(config.description)}</p>
        <div class="teti-social-links"><a href="${escape(config.social.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(config.social.label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 10.6 22 2h-1.7l-6.4 7.4L8.9 2H3l7.7 11.2L3 22h1.7l6.8-7.9 5.5 7.9h5.9l-8.2-11.4Zm-2.4 2.8-.8-1.1L5.4 3.3h2.7l4.9 7.2.8 1.1 6.4 9.2h-2.7l-5.2-7.4Z"/></svg></a></div>
      </div>
      ${groups}
    </div>
    <div class="teti-footer-bottom">© ${config.copyrightYear} ${escape(config.brand)}. ${escape(config.rights)}</div>
  </div>
</footer>`;
}
module.exports = {site,renderHeader,renderFooter};
