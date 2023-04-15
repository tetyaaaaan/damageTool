var data = {
  labels: ['最終ダメージ'], // ラベル
  datasets: [
    {
      label: '基礎ダメージ', // データセットのラベル
      data: [10], // データの値
      backgroundColor: 'rgb(75, 192, 192)', // 棒の背景色
      borderWidth: 2, // 枠線の幅
      borderColor: 'rgb(255, 255, 255)' // 枠線の色
    },
    {
      label: 'ダメバフ補正', // データセットのラベル
      data: [40], // データの値
      backgroundColor: 'rgb(153, 102, 255)', // 棒の背景色
      borderWidth: 2, // 枠線の幅
      borderColor: 'rgb(255, 255, 255)' // 枠線の色
    }
  ]
};

// グラフのオプションを設定する
var options = {
  indexAxis: 'y', // Y軸を水平方向に指定
  responsive: true, // レスポンシブ対応
  scales: {
    x: {
      display: false, // X軸の数字を非表示にする
      beginAtZero: true, // X軸を0から始める
      stacked: true  // 積み上げオプションを有効にする
    },
    y: {
      //display: false, // Y軸の数字を非表示にする
      beginAtZero: true, // Y軸を0から始める
      stacked: true, // 積み上げオプションを有効にする
    }
  }
};

const ctx = document.getElementById('barChart').getContext('2d');
    const barChart = new Chart(ctx, {
      type: 'bar', // 棒グラフを指定
      data: data, // データ
      options: options // オプション
    });