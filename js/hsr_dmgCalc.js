//ボタンを押したときの処理
function calc(){
    //ここに処理を書く
    //基礎ダメージ
    let atk = parseFloat(document.getElementById("atk").value);
    let base_atk = parseFloat(document.getElementById("base_atk").value);
    let atk_buffPer = parseFloat(document.getElementById("atk_buffPer").value);
    let atk_buffPlus = parseFloat(document.getElementById("atk_buffPlus").value);
    let talent = parseFloat(document.getElementById("talent").value);
    //ダメバフ・率ダメ・被ダメ
    let dmg_b = parseFloat(document.getElementById("dmg_b").value);
    let cri_dmg = parseFloat(document.getElementById("cri_dmg").value);
    let taken_dmg = parseFloat(document.getElementById("taken_dmg").value);
    //デバフ
    let ele_d = parseFloat(document.getElementById("ele_d").value);
    let def_d = parseFloat(document.getElementById("def_d").value);
    let def_ig = parseFloat(document.getElementById("def_ig").value);
    //敵味方のデータ
    let lv = parseFloat(document.getElementById("lv").value);
    let e_lv = parseFloat(document.getElementById("e_lv").value);
    //let e_res = parseFloat(document.getElementById("e_res").value);
    
    //NaNの対応
    if(isNaN(atk)){
        atk = 0;
    }
    if(isNaN(base_atk)){
        base_atk = 0;
    }
    if(isNaN(atk_buffPer)){
        atk_buffPer = 0;
    }
    if(isNaN(atk_buffPlus)){
        atk_buffPlus = 0;
    }
    if(isNaN(talent)){
        talent = 0;
    }
    if(isNaN(dmg_b)){
        dmg_b = 0;
    }
    if(isNaN(cri_dmg)){
        cri_dmg = 0;
    }
    if(isNaN(taken_dmg)){
        taken_dmg = 0;
    }
    if(isNaN(ele_d)){
        ele_d = 0;
    }
    if(isNaN(def_d)){
        def_d = 0;
    }
    if(isNaN(def_ig)){
        def_ig = 0;
    }
    if(isNaN(lv)){
        lv = 0;
    }
    if(isNaN(e_lv)){
        e_lv = 0;
    }

    //基礎ダメージ計算
    var value_base_dmg = (atk + (base_atk*atk_buffPer/100) + atk_buffPlus) * (talent/100);
    //ダメバフ・率ダメ・被ダメ
    var value_dmg_b = 1 + dmg_b/100;
    var value_cri_dmg = 1 + cri_dmg/100;
    var value_taken_dmg = 1 + taken_dmg/100;

    //まとめ
    let value_sum_dmg_b = value_dmg_b * value_cri_dmg * value_taken_dmg;

    //敵の靭性・弱点計算
    let toughnessSelect = document.getElementById("toughness");
    let weaknessSelect = document.getElementById("weakness");
    var toughness = 1;
    var weakness = 1;
    if(toughnessSelect.value == "yes"){
        toughness = 0.9;
    }else{
        toughness = 1;
    }
    if(weaknessSelect.value == "yes"){
        weakness = 1;
    }else{
        weakness = 0.8;
    }


    //敵の防御・耐性計算
    //ダメージ計算でのレベル＋FIXLV
    const FIXLV = 20;
    let value_e_def = (lv+FIXLV)/((1 - def_ig/100) * (1 + def_d/100) * (e_lv+FIXLV) + lv+FIXLV);
    let value_toughness = toughness;
    let value_weakness = weakness - (ele_d/100);
    
    
    
    let result = value_base_dmg * value_sum_dmg_b * value_e_def * value_toughness * value_weakness;
    document.getElementById("value_e_def").innerHTML = value_e_def;
    document.getElementById("value_e_ele").innerHTML = value_weakness;
    document.getElementById("result").innerHTML = "ダメージ結果：" + result;
    
    console.log("calc()");
    gtag('event', 'click_dmgCalc', {
            'event_category': 'button',
            'event_label': 'dmgCalc',
            'value': result.toFixed(2)
          });
    
    //円グラフ
    // データを更新
    data[0].value = value_dmg_b;
    data[1].value = value_cri_dmg;
    data[2].value = value_taken_dmg;
    //デバフによるダメージ倍率
    data[3].value = value_weakness / weakness;
    let chart_value_e_def = (lv+FIXLV)/(e_lv+FIXLV + lv+FIXLV);
    data[4].value = value_e_def / chart_value_e_def;
    /*
    data[3].value = 1/value_e_def;
    data[4].value = 1/value_e_ele;*/
    for(let i=0; i<data.length; i++){
        if(data[i].value <= 1){
            data[i].value = 0;
        }
    }
    // 円グラフのデータを更新
    myChart.data.datasets[0].data = data.map(function(item) { return item.value; });
    // 円グラフを再描画
    myChart.update();
}

// 初期の円グラフのデータ
var data = [
    //{ label: '基礎ダメージ', value: 0, color: "yellow" },
    { label: 'ダメバフ', value: 1, color: 'mediumblue' },
    { label: '会心ダメ', value: 1, color: 'darkgreen' },
    { label: '被ダメ', value: 1, color: 'orangered' },
    { label: '耐性デバフ', value: 1, color: 'purple' },
    { label: '防御デバフ', value: 1, color: 'gold' }
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
