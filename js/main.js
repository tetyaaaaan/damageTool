//ボタンを押したときの処理
function calc(){
    //ここに処理を書く
    //基礎ダメージ
    let atk = parseFloat(document.getElementById("atk").value);
    let talent = parseFloat(document.getElementById("talent").value);
    let special = parseFloat(document.getElementById("special").value);
    let add_b = parseFloat(document.getElementById("add_b").value);
    //ダメバフ・率ダメ・元素反応
    let dmg_b = parseFloat(document.getElementById("dmg_b").value);
    let cri_dmg = parseFloat(document.getElementById("cri_dmg").value);
    let ele = parseFloat(document.getElementById("ele").value);
    let ele_m = parseFloat(document.getElementById("ele_m").value);
    let ele_e = parseFloat(document.getElementById("ele_e").value);
    //デバフ
    let ele_d = parseFloat(document.getElementById("ele_d").value);
    let def_d = parseFloat(document.getElementById("def_d").value);
    let def_ig = parseFloat(document.getElementById("def_ig").value);
    //敵味方のデータ
    let lv = parseFloat(document.getElementById("lv").value);
    let e_lv = parseFloat(document.getElementById("e_lv").value);
    let e_res = parseFloat(document.getElementById("e_res").value);

    //基礎ダメージ計算
    var value_base_dmg = atk * (talent/100) * (1 +special/100) + add_b;
    //ダメバフ・率ダメ・元素反応計算
    var value_dmg_b = 1 + dmg_b/100;
    var value_cri_dmg = 1 + cri_dmg/100;
    var value_ele;
    if(ele == 1){
        value_ele = 1;
    }else{
        value_ele = ele * (1 + ele_m/100 + ele_e/100);
    }
    
    let value_sum_dmg_b = value_dmg_b * value_cri_dmg * value_ele;
    //敵の防御・元素耐性計算
    let value_e_def = (lv+100)/((1 - def_ig/100) * (1 - def_d/100) * (e_lv+100) + lv+100);
    let value_e_ele_now = e_res - ele_d;
    let value_e_ele = 0;
    if(value_e_ele_now < 0){
        value_e_ele = 1 - value_e_ele_now/200;
    }else if(value_e_ele_now < 75){
        value_e_ele = 1 - value_e_ele_now/100;
    }else{
        value_e_ele = 1 / (value_e_ele_now/25 + 1);
    }
    
    let result = value_base_dmg * value_sum_dmg_b * value_e_def * value_e_ele;
    document.getElementById("value_e_def").innerHTML = value_e_def;
    document.getElementById("value_e_ele").innerHTML = value_e_ele;
    document.getElementById("result").innerHTML = "ダメージ結果：" + result;


    // データを更新
    //valueというあたいはmain.jsの変数です。使用の際はスコープしてください
    data[0].value = value_dmg_b;
    data[1].value = value_cri_dmg;
    data[2].value = value_ele;
    /*
    data[3].value = 1/value_e_def;
    data[4].value = 1/value_e_ele;*/
    if(data[0].value == 1){
        data[0].value = 0;
    }
    if(data[2].value == 1){
        data[2].value = 0;
    }
    // 円グラフのデータを更新
    myChart.data.datasets[0].data = data.map(function(item) { return item.value; });
    // 円グラフを再描画
    myChart.update();
    
    console.log("calc()");
}



// 初期の円グラフのデータ
var data = [
    //{ label: '基礎ダメージ', value: 0, color: "yellow" },
    { label: 'ダメバフ補正', value: 1, color: 'blue' },
    { label: '会心ダメ補正', value: 1, color: 'green' },
    { label: '元素反応', value: 1, color: 'red' },/*
    { label: '敵防御', value: 1, color: 'brown' },
    { label: '敵元素耐性', value: 1, color: 'purple' }*/
  ];
  
  // グラフのオプションを設定する
  var options = {
    responsive: true,
    maintainAspectRatio: false,
  };
  
  
  // 円グラフを描画する
  // Chart.jsを使用して円グラフを描画
  var canvas = document.getElementById("myChart");
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
  