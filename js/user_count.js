var gaTrackingId = 'G-S82LRCKEPS';
  
// ユーザ数を取得する関数
function getUserCount() {
  gtag('event', 'page_view', {
    'send_to': gaTrackingId,
    'event_callback': function() {
      var userCount = gtag('get', gaTrackingId, 'users');
      document.getElementById('userCount').textContent = userCount;
    }
  });
}
// ページが読み込まれた時にユーザ数を取得する
window.addEventListener('load', getUserCount);
