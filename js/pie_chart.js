// 初期の円グラフのデータ
var data = [
  //{ label: '基礎ダメージ', value: 0, color: "yellow" },
  { label: 'ダメバフ補正', value: 0, color: 'blue' },
  { label: '会心ダメ補正', value: 0, color: 'green' },
  { label: '元素反応', value: 1, color: 'red' }
];

// グラフのオプションを設定する
var options = {
responsive: true,
maintainAspectRatio: false
};


// 円グラフを描画する
// Chart.jsを使用して円グラフを描画
var canvas = document.getElementById("chart");
var ctx = canvas.getContext("2d");
//var ctx = document.getElementById("chart").getContext('2d');
var myChart = new Chart(ctx, {
  type: 'pie',
  data: {
  labels: data.map(function(item) { return item.label; }),
  datasets: [{
      data: data.map(function(item) { return item.value; }),
      backgroundColor: data.map(function(item) { return item.color; })
  }]
  },
  options: options
});

function updatePieChart() {
  // データを更新
  //data[0].value = value_base_dmg;
  //valueというあたいはmain.jsの変数です。使用の際はスコープしてください
  /*
  data[0].value = value_dmg_b;
  data[1].value = value_cri_dmg;
  data[2].value = value_ele;
  if(data[0].value == 1){
      data[0].value = 0;
  }
  if(data[2].value == 1){
      data[2].value = 0;
  }*/

  // 円グラフのデータを更新
  myChart.data.datasets[0].data = data.map(function(item) { return item.value; });
  // 円グラフを再描画
  myChart.update();
}