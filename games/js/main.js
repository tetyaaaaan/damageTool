// 原神ダメージ計算の実行処理
function calc(){
    // 入力値を取得し、各補正の計算に使用する
    let atk = parseFloat(document.getElementById("atk").value);
    let talent = parseFloat(document.getElementById("talent").value);
    let special = parseFloat(document.getElementById("special").value);
    let add_b = parseFloat(document.getElementById("add_b").value);
    // ダメージバフ、会心ダメージ、元素反応関連
    let dmg_b = parseFloat(document.getElementById("dmg_b").value);
    let cri_dmg = parseFloat(document.getElementById("cri_dmg").value);
    //let ele = parseFloat(document.getElementById("ele").value);
    let ele_m = parseFloat(document.getElementById("ele_m").value);
    let ele_e = parseFloat(document.getElementById("ele_e").value);
    // 敵へのデバフ関連
    let ele_d = parseFloat(document.getElementById("ele_d").value);
    let def_d = parseFloat(document.getElementById("def_d").value);
    let def_ig = parseFloat(document.getElementById("def_ig").value);
    // 味方と敵のレベル・耐性
    let lv = parseFloat(document.getElementById("lv").value);
    let e_lv = parseFloat(document.getElementById("e_lv").value);
    let e_res = parseFloat(document.getElementById("e_res").value);

    // 基礎ダメージ
    var value_base_dmg = atk * (talent/100) * (1 +special/100) + add_b;
    // ダメージバフと会心ダメージ
    var value_dmg_b = 1 + dmg_b/100;
    var value_cri_dmg = 1 + cri_dmg/100;

    // 元素反応補正。激化系は固定値加算として基礎ダメージへ反映する。
    var value_ele;
    var value_ele_other = 0;
    var value_ele_addDmg = 0;
    if(ele == 1){
        value_ele = 1;
    }else if(ele == 0.15){
        // 超激化。現状はLv90固有値を使用する。
        value_ele = 1;
        var ele_m_e = 500 * ele_m / (ele_m + 1200);
        value_ele_addDmg = 1.15 * (1446) * (1 + ele_m_e/100 + ele_e/100);
        value_ele_other = (value_base_dmg + value_ele_addDmg)/ value_base_dmg;
        value_base_dmg = value_base_dmg + value_ele_addDmg;
    }else if(ele == 0.25){
        // 草激化。現状はLv90固有値を使用する。
        value_ele = 1;
        var ele_m_e = 500 * ele_m / (ele_m + 1200);
        value_ele_addDmg = 1.25 * (1446) * (1 + ele_m_e/100 + ele_e/100);
        value_ele_other = (value_base_dmg + value_ele_addDmg)/ value_base_dmg;
        value_base_dmg = value_base_dmg + value_ele_addDmg;
    }else{
        // 蒸発・溶解は反応倍率として扱う。
        var ele_m_e = 278 * ele_m / (ele_m + 1400);
        value_ele = ele * (1 + ele_m_e/100 + ele_e/100);
    }
    
    let value_sum_dmg_b = value_dmg_b * value_cri_dmg * value_ele;
    // 敵の防御補正と元素耐性補正
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
    document.getElementById("value_e_def").textContent = value_e_def.toFixed(4);
    document.getElementById("value_e_ele").textContent = value_e_ele.toFixed(4);
    document.getElementById("result").innerHTML = "<span>推定ダメージ</span><br>" + Math.round(result).toLocaleString("ja-JP");


    // 円グラフ用データを更新
    data[0].value = value_dmg_b;
    data[1].value = value_cri_dmg;
    data[2].value = value_ele;
    /*
    data[3].value = 1/value_e_def;
    data[4].value = 1/value_e_ele;*/
    if(data[0].value == 1){
        data[0].value = 0;
    }
    if(data[1].value == 1){
        data[1].value = 0;
    }
    if(data[2].value == 1){
        data[2].value = value_ele_other;
    }
    // 円グラフのデータを更新
    myChart.data.datasets[0].data = data.map(function(item) { return item.value; });
    // 円グラフを再描画
    myChart.update();
    
    // デバッグ時はここで計算完了を確認する
    
}


//元素反応の選択肢
var eleArea = document.getElementById('eleArea');
var eleChoices = document.getElementById('eleChoices');
var eleChoiceItems = document.querySelectorAll('#eleChoices li');
var eleChoiceList = Array.from(eleChoiceItems); // 選択肢のリストを配列に変換

var ele = 1;

// 非表示要素を取得
const eleContent = document.getElementById('eleCalcContent');
const normalDmgContent = document.getElementById('normalDmgContent');

eleArea.addEventListener('click', function() {
    // 選択肢ウィンドウを表示/非表示に切り替える
    if (eleChoices.style.display === 'none' || eleChoices.style.display === '') {
        eleChoices.style.display = 'block';
    } else {
        eleChoices.style.display = 'none';
    }
});

// 選択肢がクリックされた時の処理
for (var i = 0; i < eleChoiceItems.length; i++) {
    eleChoiceItems[i].addEventListener('click', function() {
        var selectedChoice = this.textContent;
        eleArea.textContent = selectedChoice;
        eleChoices.style.display = 'none';

        //選択された値を取得
        switch(eleChoiceList.indexOf(this)){
            case 0:
                //反応なし
                ele = 1;
                eleContent.style.display = 'none';
                normalDmgContent.style.display = 'block';
                break;
            case 1:
                //蒸発溶解1.5倍
                ele = 1.5;
                eleContent.style.display = 'block';
                normalDmgContent.style.display = 'block';
                break;
            case 2:
                //蒸発溶解2倍
                ele = 2;
                eleContent.style.display = 'block';
                normalDmgContent.style.display = 'block';
                break;
            case 3:
                //超激化係数1.15倍
                ele = 0.15;
                eleContent.style.display = 'block';
                normalDmgContent.style.display = 'block';
                break;
            case 4:
                //草激化係数1.25倍
                ele = 0.25;
                eleContent.style.display = 'block';
                normalDmgContent.style.display = 'block';
                break;
            case 5:
                //その他元素反応
                ele = 1;
                eleContent.style.display = 'block';
                normalDmgContent.style.display = 'none';
                break;
            default:
                //例外処理
                ele = 1;
                eleContent.style.display = 'block';
                normalDmgContent.style.display = 'block';
                break;
        }
    });
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
  
