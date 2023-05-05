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

/*
    // データを更新
    //valueというあたいはmain.jsの変数です。使用の際はスコープしてください
    data[0].value = value_dmg_b;
    data[1].value = value_cri_dmg;
    data[2].value = value_ele;
    
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
    myChart.update();*/
    
    console.log("calc()");
    
}
