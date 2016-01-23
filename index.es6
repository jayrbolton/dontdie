'use strict'
// var h = require('virtual-dom/h')
import h from 'snabbdom/h'
import {fromJS, Range} from 'immutable'
import flyd from 'flyd'
import flyd_scanMerge from 'flyd/module/scanmerge'
import flyd_filter from 'flyd/module/filter'
import flyd_lifd from 'flyd/module/lift'
import serialize from 'form-serialize'
import urlQuery from 'query-string'
import moment from 'moment'
import snabbdom from 'snabbdom'
import download from './lib/download-text-blob.es6'

let patch = snabbdom.init([
  require('snabbdom/modules/class')
, require('snabbdom/modules/props')
, require('snabbdom/modules/attributes')
, require('snabbdom/modules/style')
, require('snabbdom/modules/eventlisteners')
])

let submitData$ = flyd.stream()
let export$ = flyd.stream()
let closeModal$ = flyd.stream()
let openHelp$ = flyd.stream()

let loadState = fromJS({
  cash: 300000
, burn: 50000
, rev: 300
, cpa: 500
, sales: 12
, perc: 1
, churn: 2
, tot: 15000
})

// Load URL-cached state, if present
// Set default values for any that are missing
loadState = loadState.merge(fromJS(urlQuery.parse(document.location.search))
  .map(val => Number(val)) // String->Number
)

// Set default pageload state
let state = fromJS({formData: loadState, data: []})

// DOM root
const view = state =>
  h('div.content', [
    h('p', {style: {textAlign: 'right'}}, [h('a.button', {on: {click: openHelp$}}, 'What do these fields mean?')])
  , form(state)
  , data(state)
  , welcomeModal(state.get('seenModal'))
  , formHelpModal(state.get('helpOpened'))
  ])


// Data form 
// input quick reference:
// cash: total starting cash-on-hand for the company
// burn: total starting monthly burn rate (gross amount, not net, but don't include CPA expenses like ads and commission)
// rev: average amount of gross revenue that the company earns for a single sale
// cpa: cost per acquisition -- how much does it cost on average to close one sale?
// sales: Total number of initial sales for your most recent month
// perc: An estimated month-over-month percentage growth in sales. be conservative!
// tot: total monthly recurring revenue
const form = state =>
  h('form', {
    on: { keyup: submitData$, change: submitData$ }
  }, [
    h('fieldset', [
      h('label', 'Total cash on hand')
    , h('div.prepend', [
        h('span', '$')
      , h('input', {props: {name: 'cash', type: 'number', required: true, value: state.getIn(['formData', 'cash']), step: 1000}})
      ])
    ])
  , h('fieldset', [
      h('label', 'Monthly gross burn rate')
    , h('div.prepend', [
        h('span', '$-')
      , h('input', {props: {name: 'burn', type: 'number', required: true, value: state.getIn(['formData', 'burn']), step: 1000, min: 0}})
      ])
    ])
  , h('fieldset', [
      h('label', 'Average new MRR per sale')
    , h('div.prepend', [
        h('span', '$')
      , h('input', {props: {name: 'rev', type: 'number', required: true, value: state.getIn(['formData', 'rev']), min: 0, step: 10}})
      ])
    ])
  , h('fieldset', [
      h('label', 'Average CPA')
    , h('div.prepend', [
        h('span', '$-')
      , h('input', {props: {name: 'cpa', type: 'number', required: true, value: state.getIn(['formData', 'cpa']), min: 0, step: 10}})
      ])
    ])
  , h('fieldset', [
      h('label', 'Starting monthly sales')
    , h('input', {props: {name: 'sales', type: 'number', required: true, value: state.getIn(['formData', 'sales']), min: 0}})
    ])
  , h('fieldset', [
      h('label', 'Monthly sales growth')
    , h('div.append', [
        h('input', {props: {name: 'perc', type: 'number', required: true, value: state.getIn(['formData', 'perc']), min: 0, max: 100}})
      , h('span', '%')
      ])
    ])
  , h('fieldset', [
      h('label', 'Current total MRR')
    , h('div.prepend', [
        h('span', '$')
      , h('input', {props: {name: 'tot', type: 'number', required: true, value: state.getIn(['formData', 'tot']), min: 0, step: 100}})
      ])
    ])
  , h('fieldset', [
      h('label', 'Churn per month')
    , h('div.append', [
        h('input', {props: {name: 'churn', type: 'number', required: true, value: state.getIn(['formData', 'churn']), min: 0, max: 100, step: 1}})
      , h('span', '%')
      ])
    ])
  ])


const data = state =>
  h('div.data', [
    keyPoints(state.get('keyPoints'))
  , graph(state.get('data'))
  , h('p', {style: {textAlign: 'right'}}, [h('a.button', {on: {click: export$}}, 'Export this table as a CSV')])
  , dataTable(state.get('data'))
  ])

const keyPoints = kp => {
  if(!kp || kp.count() < 1) return h('p', '')
  return h('p', [
    kp.get('belowZero')
    ? h('span.red', [h('span', 'Goes below zero at ' + kp.get('belowZero').get('date').format("MM/YY") + '.')])
    : h('span.green', [h('span', `Cash never goes to zero! Lowest balance is $${kp.get('lowest')}.`)])
  , ' '
  , kp.get('netPos')
    ? h('span.green', [h('span', 'Net positive at ' + kp.get('netPos').get('date').format("MM/YY") + '.')])
    : h('span.red', [h('span', 'Never hits net positive!')])
  , kp.get('lowest') < 0
    ? h('span', [h('span', ` Will need to fundraise $${Math.abs(kp.get('lowest'))} to stay afloat.`)])
    : ''
  ])
}

const dataTable = data =>
  h('table', {
    style: {
      display: data.count() ? 'table' : 'none'
    }
  }, [
    h('thead', [
      h('tr', [
        h('th', 'Month') // Month #
      , h('th', 'Total cash')
      , h('th', 'New revenue')
      , h('th', 'Sales')
      , h('th', 'Total revenue')
      , h('th', 'CPA')
      , h('th', 'Churn')
      , h('th', 'Net earnings')
      ])
    ])
  , h('tbody', data.map(month => metricRow(month)).toJS())
  ])


const formHelpModal = opened =>
  opened
  ? h('div'
  , {style: {opacity: '0', transition: 'opacity 0.25s', remove: {opacity: '0'}, delayed: {opacity: '1'}}}, [
    h('div.modal', [
      h('p', [
        h('strong', 'Total cash on hand')
      , h('span', ' - Total liquidity your company has right now.')
      ])
    , h('p', [
        h('strong', 'Monthly burn')
      , h('span', ' - Your company\'s average expenses per month right now. Don\'t include costs for customer acquisition, such as sales commission and advertising')
      ])
    , h('p', [
        h('strong', 'Average new MRR per sale')
      , h('span', ' - How much new monthly recurring revenue you make on average for a single sale. For example, if you have two tiers, where one is $100 a month and the other is $300 a month, and you sell them about equally, then your average sale is about $200 MRR.')
      ])
    , h('p', [
        h('strong', 'Average CPA')
      , h('span', ' - Your average cost-per-acquisition for a single sale. To make one sale, how much do you usually have to pay in any advertising and commission? This should be a one-time expense, not recurring')
      ])
    , h('p', [
        h('strong', 'Starting monthly sales')
      , h('span', ' - The number of sales the company closed last month. Or, more accurately, the average number of sales the company made over the last few months.')
      ])
    , h('p', [
        h('strong', 'Monthly sales growth')
      , h('span', ' - What percentage you think the company will grow month over month in total number of closes. To be conservative, set this to 0%.')
      ])
    , h('p', [
        h('strong', 'Current total MRR')
      , h('span', ' - Your total monthly recurring revenue as of right now')
      ])
    , h('p', [
        h('strong', 'Churn per month')
      , h('span', ' - Estimate what percentage of your total customer base are going to quit each month.')
      ])
    ])
  , h('div.modalBackdrop', {on: {click: closeModal$}})
  ])
  : h('p', '')


const welcomeModal = seenModal => 
  seenModal
  ? h('p', '')
  : h('div'
  , {style: {opacity: '0', transition: 'opacity 0.25s', remove: {opacity: '0'}, delayed: {opacity: '1'}}}
  , [ h('div.modal', [
      h('p', 'Welcome to the SAAS startup runway and survival calculator!')
    , h('p', 'This is designed specifically for software-as-a-service companies that are building monthly recurring revenue (MRR).')
    , h('p', 'It will give you a good general idea of your survival chances using your current business model. Keep in mind that these are broad-stroke predictions. It only gives projections up to three years out; really, anything more than a year out is pretty unpredictable!')
    , h('p', 'Once you have chosen some settings, send the URL to someone to let them see your calculations! The URL will get automatically updated to your settings.')
    , h('hr')
    , h('p', [h('a.button', {on: {click: closeModal$}}, 'Get Going')])
    ])
  , h('div.modalBackdrop', {on: {click: closeModal$}})
  ])

const graph = months => {
  let [height, width] = [200, 900]
  // Only need the net values for the graph currently
  let nets = months.map(m => m.get('net'))
  // Use the range for scaling
  let range = nets.max() - nets.min()
  // Scale each net to a number between 1-100 using the range
  let scaled = nets.map(n => n * (height / 2) / range)
  // Convert the scaled data into an array of rectangle data
  let rectWidth = width / scaled.count() 
  let rects = scaled.map(
    (net, idx) => ({
      x: idx * rectWidth
    , y: (height / 2) - (net > 0 ? net : 0)
    , width: rectWidth - 5
    , height: Math.abs(net)
    , fill: net < 0 ? 'rgba(255, 0, 0, 0.6)' : 'rgba(0, 128, 0, 0.6)'
    })
  )
  return h('svg', {attrs: {width: width, height: height}}, [
    h('line', {attrs: {x1: 0, y1: height / 2, x2: width, y2: height / 2, style: "stroke: rgb(240,240,240); stroke-width: 2"}})
  ].concat(
    rects.map(rect => h('rect', {attrs: rect, })).toJS()
  ))
}


const metricRow = month =>
  h('tr', [
    h('td', [h('strong', '' + month.get('date').format("MM/YY"))])
  , h('td', {
      class: {
        green: month.get('cash') > 0
      , red:   month.get('cash') <= 0
      }
    }, '$' + month.get('cash'))
  , h('td', '$' + month.get('revenue_per_month'))
  , h('td', ''  + month.get('sales_per_month'))
  , h('td', '$' + month.get('total_revenue'))
  , h('td', '$' + month.get('cpa_per_month'))
  , h('td', '$' + month.get('churn_amount'))
  , h('td', {
      class: {
        green: month.get('net') > 0
      , red:   month.get('net') <= 0
      }
    }, '$' + month.get('net'))
  ])


let formData$ = flyd.map(
  ev => fromJS(serialize(ev.currentTarget, {hash: true})).map(v => Number(v))
, submitData$
)



// Given the monthly data (calculated by calculateMetrics), calculate some key data points
function calculateKeyPoints(months) {
  return fromJS({
    belowZero: months.filter(m => m.get('cash') <= 0).first()
  , netPos: months.filter(m => m.get('net') > 0).first()
  , lowest: months.map(m => m.get('cash')).min()
  })
}

// Given a set of data for last month, calculate the numbers for the next month
// Also pass in a formData Map that has churn, rev, burn, cpa
// last needs sales_per_month, total_sales, cash, and total_revenue
function calculateMonth(last, data, date) {
  let churn_per_month = Math.round(data.get('churn') / 100 * last.get('total_sales'))
  // Last month's sales plus percentage growth minus total churn this month
  let sales_per_month = Math.round(last.get('sales_per_month') + data.get('perc') / 100 * last.get('sales_per_month'))
  let total_sales = last.get('total_sales') + sales_per_month - churn_per_month
  let net = last.get('total_revenue') + sales_per_month * data.get('rev') + churn_per_month * -data.get('rev') - data.get('burn')

  return fromJS({
    date: date
  , cash: last.get('cash') + net
  , net: net
  , total_sales: total_sales
  , sales_per_month: sales_per_month
  , revenue_per_month: sales_per_month * data.get('rev')
  , cpa_per_month: sales_per_month * -data.get('cpa')
  , total_revenue: last.get('total_revenue') + sales_per_month * data.get('rev') + churn_per_month * -data.get('rev')
  , churn_amount: churn_per_month * -data.get('rev')
  , churn_per_month: churn_per_month
  })
}


// Given the submitted form data, calculate their month-by-month metrics
function calculateMetrics(data) {
  let starting = calculateMonth(fromJS({
    sales_per_month: data.get('sales')
  , total_sales: data.get('sales')
  , cash: data.get('cash')
  , total_revenue: data.get('tot')
  }), data, moment())
  return Range(1,36).map(n => moment().add(n, 'months'))
    .reduce(
      (months, date) => months.push(calculateMonth(months.last(), data, date))
    , fromJS([starting])
    )
}

let fieldLength = 8

let $validFormData = flyd_filter(
  data => data.filter(val => val >= 0).count() === fieldLength
, formData$
)

let metrics$ = flyd.map(calculateMetrics, $validFormData)

let keyPoints$ = flyd.map(calculateKeyPoints, metrics$)

// Perform exports
function exportData(state) {
  let headers = 'Month, Total cash, New revenue, Sales, Total revenue, CPA, Churn, Net earnings'
  let blob = [headers]
    .concat(state.get('data').map(
      row => [
        row.get('date').format("MM/DD/YY"),
        '$'+row.get('cash'),
        '$'+row.get('revenue_per_month'),
        row.get('sales_per_month'),
        '$'+row.get('total_revenue'),
        '$'+row.get('cpa_per_month'),
        row.get('churn_amount'),
        '$'+row.get('net')
      ].join(",")
    ).toJS()).join("\n")
  download('runway.csv', blob)
  return state
}

let state$ = flyd.immediate(flyd_scanMerge([
  [formData$,                 (state, data) => state.set('formData', data)]
, [metrics$,                  (state, data) => state.set('data', data)]
, [keyPoints$,                (state, data) => state.set('keyPoints', data)]
, [export$,                   exportData]
, [closeModal$,               state => localStorage.setItem('seenModal', 1) || state.set('seenModal', 1).set('helpOpened', false)]
, [openHelp$,                 state => state.set('helpOpened', true)]
], state))

let urlState$ = flyd.map(
  state => '?' + urlQuery.stringify(state.get('formData').toJS())
, state$
)

// Pull cache seenModal to localstorage to prevent seeing the intro twice
if(localStorage.getItem('seenModal')) closeModal$(1)

// push our url state stream to the url with history.pushState
let $history = flyd.map(
  query => history.pushState({}, 'x', query)
, urlState$
)

let container = document.querySelector('#content')
let vnode$ = flyd.map(view, state$)
let dom$ = flyd.scan(patch, container, vnode$)


// -- Pageload URL state init stuff
// Calculate and display the metrics on pageload if the formdata is cached
if(state.get('formData').count() === fieldLength) {
  formData$(loadState)
// Go back to the form step if a param is missing and we're on the data step
}

window.state$ = state$
// Debugger function for logging streams quickly
var n = 1
function log($) { n++; flyd.map(x => console.log(x.toJS ? x.toJS() : x, n), $) }
