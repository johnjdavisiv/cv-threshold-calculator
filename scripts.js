// John J Davis, RunningWritings.com

// TODO: 
// 400m mode needs decimals, for sure on output.
// Need to update paces below the race time
// Implemetn 200m splits (also with decimals)
//Implement toggle for unceratinty


// Conditonal logic for median vs safe mode

// Limit width of race distance options

// Implement custom race distance as an input thigny (wind custom weight)

// consoel leog an oputpu fo the speed input, in all cases (pace, race time, etc)

// Nicely formatted output table: 

// Threshold: XXX/mi
// CV pace: XXX/mi
// VO2max: XXX/mi  --> change units w/ button
//

// quantile mods

// )
const qmodParams = {
    "cs_10": {
      "y_outcome": "cs",
      "q_prob": 0.1,
      "beta0": -13.5275,
      "beta1_log10_dist": 13.3616,
      "beta2_log10_time": -7.7425,
      "beta3_interaction": -0.7145
    },
    "cs_50": {
      "y_outcome": "cs",
      "q_prob": 0.5,
      "beta0": -11.8345,
      "beta1_log10_dist": 13.0957,
      "beta2_log10_time": -8.2196,
      "beta3_interaction": -0.6415
    },
    "cs_90": {
      "y_outcome": "cs",
      "q_prob": 0.9,
      "beta0": -7.6937,
      "beta1_log10_dist": 11.9369,
      "beta2_log10_time": -9.4216,
      "beta3_interaction": -0.2948
    },
    "cs_minus_10": {
      "y_outcome": "cs_minus",
      "q_prob": 0.1,
      "beta0": -12.3292,
      "beta1_log10_dist": 12.6187,
      "beta2_log10_time": -7.6914,
      "beta3_interaction": -0.604
    },
    "cs_minus_50": {
      "y_outcome": "cs_minus",
      "q_prob": 0.5,
      "beta0": -10.9242,
      "beta1_log10_dist": 12.5813,
      "beta2_log10_time": -8.2974,
      "beta3_interaction": -0.5408
    },
    "cs_minus_90": {
      "y_outcome": "cs_minus",
      "q_prob": 0.9,
      "beta0": -8.1008,
      "beta1_log10_dist": 11.9847,
      "beta2_log10_time": -9.2736,
      "beta3_interaction": -0.3211
    },
    "cs_plus_10": {
      "y_outcome": "cs_plus",
      "q_prob": 0.1,
      "beta0": -14.5271,
      "beta1_log10_dist": 14.0454,
      "beta2_log10_time": -7.809,
      "beta3_interaction": -0.825
    },
    "cs_plus_50": {
      "y_outcome": "cs_plus",
      "q_prob": 0.5,
      "beta0": -11.7272,
      "beta1_log10_dist": 13.2364,
      "beta2_log10_time": -8.4258,
      "beta3_interaction": -0.6314
    },
    "cs_plus_90": {
      "y_outcome": "cs_plus",
      "q_prob": 0.9,
      "beta0": -8.7465,
      "beta1_log10_dist": 12.3211,
      "beta2_log10_time": -9.0624,
      "beta3_interaction": -0.4098
    }
  }
  


//console.log(qmodParams)
  

// ---- Setup initial params ----

const RUNNER_SPEED_DEFAULT = 4.62962962962963 // 18:00 5k pace
let input_m_s = RUNNER_SPEED_DEFAULT // or can just read from pace dials...

let race_dist_m = 5000

// lol global scope
let minute_val
let sec_val
let dec_minutes
let dec_seconds


let output_units = "/mi" // changes when you cahnge output buttons

function updateResult(){
    console.log('*************************************************')
    console.log('RESULT UPDATED')
    console.log(`Current speed pre-fxn call: ${input_m_s}`)
    // Wrapper function to attache verything to.
    
    // CONSIDER: cool color changing gradient for headwind button
    // ie angle changse it   
    // notice how we need to read weight here, not externally in global space
    readCurrentSpeed()
    //doPaceCalcs()
    updateOutput()

    //lookupTrainingPaces(input_m_s);
    
    // ok bc of scope and such we need to read the values at all times! 
}




const pace_dials = document.querySelector('#pace-dials')
const unit_togs = document.querySelector('#input-units')



// Dial and input controls
// --- Incrementing pace dials --- 

//First incrementor - maybe ifelse considering what units we have? 
let d1 = document.querySelector("#d1");
const d1_up = document.querySelector('#d1-up');
const d1_down = document.querySelector('#d1-down');

d1_up.addEventListener('click', () => {
    // can add ifelse logic here and to the down based on our current units
    increment_minutes(d1,1);
    updateResult();
});

d1_down.addEventListener('click', () => {
    increment_minutes(d1,-1);
    updateResult();
});

//Second incrementors - a bit different
const d2_up = document.querySelector('#d2-up');
const d2_down = document.querySelector('#d2-down');

d2_up.addEventListener('click', () => {
    increment_sec_digit(d2,6,1);
    updateResult();
});

d2_down.addEventListener('click', () => {
    increment_sec_digit(d2,6,-1);
    updateResult();
});

// 3rd digit is limit 10
const d3_up = document.querySelector('#d3-up');
const d3_down = document.querySelector('#d3-down');

d3_up.addEventListener('click', () => {
    increment_sec_digit(d3,10,1);
    updateResult();
});

d3_down.addEventListener('click', () => {
    increment_sec_digit(d3,10,-1,5); //floor of 5
    updateResult();
});



// incrementor functions
function increment_sec_digit(digit_object, digit_limit, change){
    let digit_val = parseInt(digit_object.textContent);
    // mod ops to circularize
    if (change === 1) {
        digit_val = (digit_val + 1) % digit_limit;
    }
    if (change === -1) {
        digit_val = (digit_val - 1 + digit_limit) % digit_limit;
    }
    // DEAL WITH 0:00 SOMEHOW...
    digit_object.textContent = digit_val;
}



function increment_minutes(digit_object,change){
    let digit_val = parseInt(digit_object.textContent);
    //Disallow > 40
    
    //Disallow values depending on mode
    const input_units = document.querySelector('#pace-units')
    
    // optoions: 5k, /mi, /km, /400m
    let limit_lo = 0;
    let limit_hi = 40;
    // if (input_units.textContent == "5k"){
    //     limit_lo = 5
    //     limit_hi = 40
    // } else if (input_units.textContent == "/mi"){
    //     limit_lo = 3
    //     limit_hi = 13
    // } else if (input_units.textContent == "/km"){
    //     limit_lo = 2
    //     limit_hi = 8
    // } else if (input_units.textContent == "/400m"){
    //     limit_lo = 0
    //     limit_hi = 3
    // }
    
    
    // disallow high val
    if (change > 0 && digit_val < limit_hi) {
        digit_object.textContent = digit_val + change
    }
    
    //disallow lo val

    if (digit_val > limit_lo && change < 0) {
        digit_object.textContent = digit_val + change
    }
}

// --- Race distance selectors

const race_buttons = document.querySelectorAll('.race-button');
// const input_text = document.querySelector('#pace-units')
// maybe just don't put that up at all?

race_buttons.forEach(button => {
    button.addEventListener('click', (e) => {
               // Remove active class from all buttons
               race_buttons.forEach(btn => btn.classList.remove('active'));
               // Toggle the active state of the clicked button
               e.target.classList.toggle('active');
               setRaceDistance(button);
            //    input_text.textContent = button.textContent
               //setPace(button);
    })
})

// ------ Unit selectors (Input / output) -------


// Input unit selector
const pace_buttons = document.querySelectorAll('.pace-toggle');

pace_buttons.forEach(button => {
    button.addEventListener('click', (e) => {
        // Remove active class from all buttons
        pace_buttons.forEach(btn => btn.classList.remove('active'));
        // Toggle the active state of the clicked button
        e.target.classList.toggle('active');
        setPace(button);
    });
});



// Output unit selector
const output_buttons = document.querySelectorAll('.output-toggle');

output_buttons.forEach(button => {
    button.addEventListener('click', (e) => {
        // Remove active class from all buttons
        output_buttons.forEach(btn => btn.classList.remove('active'));
        // Toggle the active state of the clicked button
        e.target.classList.toggle('active');
        setOutputText(button);
        updateResult();
    });
});



function setRaceDistance(button){
    const race_text = button.textContent; // 800m 5k, etc
    console.log('Fire setRaceDistance!')

    if (race_text == 'custom'){
        // lol i dunno what to do here yet
    } else {
        let race_dist_m = race_dict[race_text]
        readCurrentSpeed();
        console.log('Updated race distance is:')
        console.log(race_dist_m)
        console.log('Updated race speed is:')
        console.log(race_dist_m)
    }
}



const race_dict = {
    // key/value pairs of race name (string) and distance (m)
    '800m':800,
    '1000m':1000,
    '1200m':1200,
    '1600m':1600,
    'Mile':1609.344,
    '3000m':3000,
    '3200m':3200,
    '2 mi':3218.688,
    '4 km':4000,
    '5 km':5000,
    '6 km':6000,
    '8 km': 8000,
    '10 km':10000
}




// function setPace(button){
//     let input_units = document.querySelector('#pace-units')
//     let time_or_pace = document.querySelector('#time-or-pace')

//     console.log(input_m_s)

//     // original_units is "from", button.textContent is "to"

//     input_units.textContent = button.textContent;
    
//     if (button.textContent == '5k') {
//         time_or_pace.textContent = 'time'
//     } else {
//         time_or_pace.textContent = 'pace'
//     }
    
//     // Also need to "translate" paces across, and institute limits on values?


//     // now can use input_ms which is still what was on original unit dials


//     // Get function to convert m/s --> pace in target output unit (e.g. per km)
//     const convert_fxn = convert_dict[button.textContent]
//     const convert_text = convert_fxn(input_m_s)
    

//     // now split... 

//     // may need a "secret" decimal place?
    
//     const [minutes, seconds] = convert_text.split(':');

//     d1.textContent = minutes
//     d2.textContent = seconds[0]
//     d3.textContent = seconds[1]

//     // Now update dial text
//     //d1.textContent = minutes
// }



// converting from dict string pace 

function parseTime(timeString) {
    // Split the string into minutes and seconds
    const [minutes, seconds] = timeString.split(':');
    // Convert them to integers
    const minutesInt = parseInt(minutes, 10);
    const secondsInt = parseInt(seconds, 10);
    return { minutes: minutesInt, seconds: secondsInt };
}




// Make output match input
function setOutputText(button){
    output_units = button.textContent;
    const resultUnits = document.querySelectorAll('.result-units');

    // need a query selector and drop in too
    resultUnits.forEach((span) => {
        span.textContent = output_units;
    });
}


// ----- Reading speed from digits
function readCurrentSpeed(){
    // Pace mode
    // read mm:ss
    minute_val = parseInt(d1.textContent)
    sec_val = 10*parseInt(d2.textContent) + parseInt(d3.textContent)
    dec_minutes = minute_val + sec_val/60
    dec_seconds = dec_minutes*60

    console.log('READING RACE UNITS')
    console.log(`Thinks race dist is: ${race_dist_m}`)
    console.log(`Thinks race duration is: ${dec_minutes}`)
    console.log(`Thinks race speed is: ${race_dist_m / dec_seconds}`)


    input_m_s = race_dist_m / dec_seconds
    // meters per second

    // if (pace_units == "/mi"){
    //     //Convert to m/s
    //     input_m_s = 1609.344/(60*dec_minutes)
    // } else if (pace_units == "/km"){
    //     //Convert to m/s
    //     input_m_s = 1000/(60*dec_minutes)
    // } else if (pace_units == "5k"){
    //     console.log('FIRE')
    //     console.log(dec_minutes)
    //     input_m_s = 5000/(60*dec_minutes)
    // } else if (pace_units == "/400m"){
    //     input_m_s = 400/(60*dec_minutes)
    // }

    
    console.log('*****')
    console.log(`Input speed: ${input_m_s}`)
}


/// m/s output to string
let conv_dec

const convert_dict = {
    // functions to convert m/s to [output unit, as key]
    '/mi':function (m_s){
        // to decimal minutes per mile
        conv_dec = 1609.344/(m_s*60)
        return decimal_pace_to_string(conv_dec);
    },
    '/km':function (m_s){
        // to decimal minutes per km
        conv_dec = 1000/(m_s*60)
        return decimal_pace_to_string(conv_dec);
    },
    '/400m':function (m_s){
        // to decimal minutes per km
        conv_dec = 400/(m_s*60)
        return decimal_pace_to_string(conv_dec);
    },
    'mph':function (m_s){
        conv_dec = m_s*2.23694
        return conv_dec.toFixed(1);
    },
    'km/h':function (m_s){
        conv_dec = m_s*3.6
        return conv_dec.toFixed(1);
    },
    'm/s':function (m_s){
        // ez mode lol
        return m_s.toFixed(2);
    },
    '5k':function (m_s){
        conv_dec = 5000/(m_s*60)
        return decimal_pace_to_string(conv_dec);
    }
}

function decimal_pace_to_string(pace_decimal){
    let pace_min = Math.floor(pace_decimal)
    //Could be zero!! 
    let pace_sec = (pace_decimal - pace_min)*60
    //e.g. 9.50 --> 30 

    //Deal with e.g. 3:59.9 --> 4:00.0
    if (Math.round(pace_sec) === 60) {
        pace_sec = 0
        pace_min = pace_min+1;
    } else {
        pace_sec = Math.round(pace_sec);
    }
    //To formatted string
    res = `${pace_min}:${pace_sec.toString().padStart(2,'0')}` 
    return res
}


function updateOutput(){
  console.log('FIRE OUTPUT UPDATE')
  readCurrentSpeed()

  let cs_results = lookupTrainingPaces();

  let out_text_threshold = document.querySelector('#threshold-pace')
  let out_text_cv = document.querySelector('#cv-pace')
  let out_text_vo2max = document.querySelector('#vo2max-pace')
  
  // returns a dict w 'cs' 'cs_minus' 'cs_plus' fields, FLOAT m/s entry! 
  cs_results = lookupTrainingPaces(input_m_s)


  if (!Number.isFinite(input_m_s) || Number.isNaN(cs_results['cs_minus'])){
    // Actually only need cs minus snice rest will also be NaN
      // If we get any funny business...hmm
      out_text_threshold.textContent = '🤔' // hmm
      out_text_cv.textContent = '🤔' // hmm
      out_text_vo2max.textContent = '🤔' // hmm
  } else {
    console.log('fire inner else')
    const convert_fxn = convert_dict[output_units]

    out_text_threshold.textContent = convert_fxn(cs_results['cs_minus_10'])
    out_text_cv.textContent = convert_fxn(cs_results['cs_50'])
    out_text_vo2max.textContent = convert_fxn(cs_results['cs_plus_90'])



  }

}




// {"cs_10": {
//     "y_outcome": "cs",
//     "q_prob": 0.1,
//     "beta0": -13.5275,
//     "beta1_log10_dist": 13.3616,
//     "beta2_log10_time": -7.7425,
//     "beta3_interaction": -0.7145
//   }
// }

// also cs_minus_90 etc etc

// y ~ 1 + x1 + x2 + x1:x2
function predictQMod(y_outcome, log10_dist, log10_time) {
    const params = qmodParams[y_outcome];
    const beta0 = params["beta0"];
    const beta1x1 = params["beta1_log10_dist"] * log10_dist;
    const beta2x2 = params["beta2_log10_time"] * log10_time;
    const beta3x3 = params["beta3_interaction"] * log10_dist * log10_time;

    return beta0 + beta1x1 + beta2x2 + beta3x3;
}


// Lookup function
// Given a grid of speeds speed_grid, and a metaboic cost in W/kg at each speed cost_grid,
// return the speed whose metabolic cost most closely matches cost_query
function lookupTrainingPaces() {

    let log10_dist = Math.log10(race_dist_m)
    let log10_time = Math.log10(dec_seconds)

    // Predict and return as dict
    const cs_results = {
        'cs_minus_10':predictQMod("cs_minus_10", log10_dist, log10_time),
        'cs_minus_90':predictQMod("cs_minus_90", log10_dist, log10_time),
        'cs_10':predictQMod("cs_10", log10_dist, log10_time),
        'cs_50':predictQMod("cs_50", log10_dist, log10_time),
        'cs_90':predictQMod("cs_90", log10_dist, log10_time),
        'cs_plus_10':predictQMod("cs_plus_10", log10_dist, log10_time),
        'cs_plus_90':predictQMod("cs_plus_90", log10_dist, log10_time)
    }
    console.log(cs_results)
    return cs_results;

}



// Behaves same as seq(start_val, end_val, by = grid_step) in R
function makeGrid(start_val, end_val, grid_step) {
  const length = Math.floor((end_val - start_val) / grid_step) + 1; // Adjusted to use Math.floor
  const grid = Array.from({length: length}, (_, i) => parseFloat((start_val + i * grid_step).toFixed(10)));
  return grid;
}


updateResult();