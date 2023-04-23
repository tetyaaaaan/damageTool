//トラッキングID
var gTrackingId = 'G-S82LRCKEPS';


// ユーザ数を取得してHTML要素に表示する関数
function updateUserCount(userCount) {
  document.getElementById('userCount').innerText = userCount;
}

// Google Analyticsのユーザ数を取得する関数
function fetchUserCount() {
  gtag('get', gTrackingId, 'users', function(response) {
    // ユーザ数の取得が完了した後にHTML要素に表示
    var userCount = response['users'];
    updateUserCount(userCount);
  });
}

// ページ読み込み時にユーザ数を取得
window.addEventListener('load', function() {
  fetchUserCount();
});


/*
// ユーザ数を取得してHTML要素に表示する関数
function updateUserCount(userCount) {
  document.getElementById('userCount').innerText = userCount;
}

// Google Analyticsのユーザ数を取得する関数
function fetchUserCount() {
  gtag('config', gTrackingId, {'send_page_view': false});
  gtag('event', 'page_view', {
    'send_to': gTrackingId,
    'event_callback': function() {
      gtag('get', gTrackingId, 'users', function(userCount) {
        updateUserCount(userCount);
      });
    }
  });
}

// ページ読み込み時にユーザ数を取得
window.addEventListener('load', function() {
  fetchUserCount();
});
*/
