"use client";

import { useState } from "react";
import { Badge, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";

import type { StrategyDefinition, StrategyKind, StrategyTimeframe, StrategyRuleGroup, StrategyCondition } from "types/trading/strategy";
import { STRATEGY_KINDS, ALLOWED_INTRADAY_MINUTES, CRYPTO_STRATEGY_TIMEFRAMES, EQUITY_STRATEGY_TIMEFRAMES, SIZING_MODES, ORDER_TYPES, STRATEGY_CONDITION_SOURCES, STRATEGY_CONDITION_OPERATORS } from "types/trading/strategy";
import type { TradingProvider, TradingAssetClass, TradingExecutionMode } from "types/trading/adapter";
import { TRADING_PROVIDERS, TRADING_ASSET_CLASSES, TRADING_EXECUTION_MODES } from "types/trading/adapter";
import { DEFAULT_CRYPTO_TIMEFRAME, isForbiddenCryptoTimeframe } from "libs/trading/tradingTimeframeGuard";

export type StrategyDraft = Omit<StrategyDefinition, "provider"|"assetClass"|"trigger">&{
  provider:TradingProvider|"";assetClass:TradingAssetClass|"";
  trigger: { kind: string; atKst?: string; everyMinutes?: number; weekday?: number; dayOfMonth?: number };
};

type VerificationStatus = {syntax:boolean;backtest:"none"|"pending"|"pass"|"fail";paper:"none"|"running"|"pass"|"fail";orderTest:"none"|"pending"|"pass"|"fail"|"unsupported";live:"none"|"active"|"paused"};
const STEPS=["거래대상","실행주기","진입","청산","주문방식","포지션크기","위험","검증"] as const;

function pl(p:string){return p==="upbit"?"업비트":p==="toss_securities"?"토스증권":p}
function al(a:string){return a==="crypto"?"가상자산":a==="equity"?"주식":a}
function ml(m:string){return({disabled:"비활성",backtest:"백테스트",paper:"Paper",broker_test:"주문 테스트",approval:"승인형",auto:"자동"}as Record<string,string>)[m]??m}

function emptyDraft():StrategyDraft{return{provider:"",assetClass:"",name:"",instruments:[],kind:"signal",timeframe:DEFAULT_CRYPTO_TIMEFRAME,trigger:{kind:"daily_close",atKst:"09:00"},executionMode:"paper",status:"draft",sizingPolicy:{mode:"fixed_quote_amount",value:"10000"},orderPolicy:{type:"LIMIT"},riskPolicyId:"risk-default",version:1}}

type Props={initial?:Partial<StrategyDraft>;onSave?:(d:StrategyDraft)=>void;onCancel?:()=>void;providerCapabilities?:{orderTest:boolean;conditionalOrder:boolean;timeInForce:string[]}};

export default function StrategyEditorWizard({initial,onSave,onCancel,providerCapabilities}:Props){
  const[step,setStep]=useState(0);
  const[draft,setDraft]=useState<StrategyDraft>({...emptyDraft(),...initial});
  const provider=draft.provider as TradingProvider|"";
  const assetClass=draft.assetClass as TradingAssetClass|"";
  const availableTimeframes=assetClass==="equity"?EQUITY_STRATEGY_TIMEFRAMES:CRYPTO_STRATEGY_TIMEFRAMES;
  const verif:VerificationStatus={syntax:!!draft.name&&draft.instruments.length>0&&!!draft.provider,backtest:"none",paper:"none",orderTest:providerCapabilities?.orderTest?"none":"unsupported",live:"none"};
  function u(f:Partial<StrategyDraft>){setDraft(p=>({...p,...f}))}
  function nx(){if(step<7)setStep(step+1)}
  function pv(){if(step>0)setStep(step-1)}

  return(<div className="mx-auto max-w-2xl">
    <div className="mb-6 flex gap-1">{STEPS.map((s,i)=>(<button key={s} type="button" onClick={()=>setStep(i)} className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${i===step?"bg-primary text-primary-foreground":i<step?"bg-primary/20 text-primary":"bg-muted text-muted-foreground"}`}>{i+1}.{s}</button>))}</div>
    {step===0&&(<div className="space-y-4"><h3 className="text-lg font-semibold">1. 거래대상</h3>
      <div className="space-y-2"><Label>거래소</Label><Select value={provider} onValueChange={v=>u({provider:v as TradingProvider})}><SelectTrigger><SelectValue placeholder="거래소 선택"/></SelectTrigger><SelectContent>{TRADING_PROVIDERS.map(p=>(<SelectItem key={p} value={p}>{pl(p)}</SelectItem>))}</SelectContent></Select></div>
      <div className="space-y-2"><Label>자산군</Label><Select value={assetClass} onValueChange={v=>u({assetClass:v as TradingAssetClass})}><SelectTrigger><SelectValue placeholder="자산군 선택"/></SelectTrigger><SelectContent>{TRADING_ASSET_CLASSES.map(a=>(<SelectItem key={a} value={a}>{al(a)}</SelectItem>))}</SelectContent></Select></div>
      <div className="space-y-2"><Label>전략명</Label><Input value={draft.name} onChange={e=>u({name:e.target.value})} placeholder="예: BTC 일봉 추세 추종"/></div>
      <div className="space-y-2"><Label>종목 (쉼표 구분)</Label><Input value={draft.instruments.join(", ")} onChange={e=>u({instruments:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})} placeholder="예: KRW-BTC, KRW-ETH"/></div>
      <div className="space-y-2"><Label>전략 유형</Label><Select value={draft.kind} onValueChange={v=>u({kind:v as StrategyKind})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{STRATEGY_KINDS.map(k=>(<SelectItem key={k} value={k}>{k==="signal"?"신호 기반":"리밸런싱"}</SelectItem>))}</SelectContent></Select></div>
    </div>)}

    {step===1&&(<div className="space-y-4"><h3 className="text-lg font-semibold">2. 실행주기</h3>
      <div className="space-y-2"><Label>Timeframe</Label><Select value={draft.timeframe} onValueChange={v=>u({timeframe:v as StrategyTimeframe})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{availableTimeframes.map(tf=>(<SelectItem key={tf} value={tf} disabled={isForbiddenCryptoTimeframe(tf)}>{tf}{isForbiddenCryptoTimeframe(tf)?" (사용 불가)":""}</SelectItem>))}</SelectContent></Select>{assetClass==="crypto"&&<p className="text-xs text-muted-foreground">크립토 최소 5m, 기본 15m. 1m/3m은 사용 불가.</p>}</div>
      <div className="space-y-2"><Label>트리거 방식</Label><Select value={draft.trigger.kind} onValueChange={v=>{if(v==="daily_close")u({trigger:{kind:"daily_close",atKst:"09:00"}});else if(v==="intraday")u({trigger:{kind:"intraday",everyMinutes:15}});else if(v==="weekly")u({trigger:{kind:"weekly",weekday:1,atKst:"09:00"}});else if(v==="monthly")u({trigger:{kind:"monthly",dayOfMonth:1,atKst:"09:00"}})}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="daily_close">일봉 마감 후</SelectItem><SelectItem value="intraday">인트라데이</SelectItem><SelectItem value="weekly">주간</SelectItem><SelectItem value="monthly">월간</SelectItem></SelectContent></Select></div>
      {draft.trigger.kind==="intraday"&&<div className="space-y-2"><Label>실행 간격 (분)</Label><Select value={String(draft.trigger.everyMinutes)} onValueChange={v=>u({trigger:{kind:"intraday",everyMinutes:Number(v)as typeof ALLOWED_INTRADAY_MINUTES[number]}})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{ALLOWED_INTRADAY_MINUTES.map(m=>(<SelectItem key={m} value={String(m)}>{m}분</SelectItem>))}</SelectContent></Select></div>}
      {draft.trigger.kind==="weekly"&&<div className="flex gap-2"><Select value={String(draft.trigger.weekday)} onValueChange={v=>u({trigger:{...draft.trigger,weekday:Number(v)as 1|2|3|4|5}})}><SelectTrigger className="w-24"><SelectValue/></SelectTrigger><SelectContent>{[1,2,3,4,5].map(d=>(<SelectItem key={d} value={String(d)}>{["","월","화","수","목","금"][d]}</SelectItem>))}</SelectContent></Select><Input className="w-24" value={draft.trigger.atKst} onChange={e=>u({trigger:{...draft.trigger,atKst:e.target.value}})} placeholder="09:00"/></div>}
    </div>)}

    {step===2&&draft.kind==="signal"&&(<div className="space-y-4"><h3 className="text-lg font-semibold">3. 진입 조건</h3><ConditionEditor group={draft.entryRules??{logic:"and",conditions:[]}} onChange={g=>u({entryRules:g})}/></div>)}
    {step===2&&draft.kind==="rebalance"&&(<div className="space-y-4"><h3 className="text-lg font-semibold">3. 리밸런싱 정책</h3><div className="space-y-2"><Label>목표 비중 (심볼=비중, 쉼표 구분)</Label><Input value={(draft.rebalancePolicy?.targets??[]).map(t=>`${t.symbol}=${t.targetWeight}`).join(", ")} onChange={e=>{const targets=e.target.value.split(",").map(s=>{const[a,b]=s.trim().split("=");return{symbol:a?.trim()??"",targetWeight:b?.trim()??"0"}}).filter(t=>t.symbol);u({rebalancePolicy:{...draft.rebalancePolicy??{targets:[],toleranceBandBps:500,minOrderAmount:"5000",cadence:"on_drift",cashBufferRatio:"0.02"},targets}})}} placeholder="KRW-BTC=0.60, KRW-ETH=0.40"/></div><div className="flex gap-4"><div className="flex-1 space-y-2"><Label>허용 밴드 (bps)</Label><Input type="number" value={draft.rebalancePolicy?.toleranceBandBps??500} onChange={e=>u({rebalancePolicy:{...draft.rebalancePolicy!,toleranceBandBps:Number(e.target.value)}})}/></div><div className="flex-1 space-y-2"><Label>최소 주문금액</Label><Input value={draft.rebalancePolicy?.minOrderAmount??"5000"} onChange={e=>u({rebalancePolicy:{...draft.rebalancePolicy!,minOrderAmount:e.target.value}})}/></div></div></div>)}

    {step===3&&draft.kind==="signal"&&(<div className="space-y-4"><h3 className="text-lg font-semibold">4. 청산 조건</h3><ConditionEditor group={draft.exitRules??{logic:"or",conditions:[]}} onChange={g=>u({exitRules:g})}/><p className="text-xs text-muted-foreground">청산 조건이 없으면 수동 청산만 가능합니다.</p></div>)}
    {step===3&&draft.kind==="rebalance"&&(<div className="space-y-4"><h3 className="text-lg font-semibold">4. 리밸런싱 주기</h3><Select value={draft.rebalancePolicy?.cadence??"on_drift"} onValueChange={v=>u({rebalancePolicy:{...draft.rebalancePolicy!,cadence:v as"monthly"|"quarterly"|"on_drift"}})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="on_drift">밴드 이탈 시</SelectItem><SelectItem value="monthly">월간</SelectItem><SelectItem value="quarterly">분기</SelectItem></SelectContent></Select></div>)}

    {step===4&&(<div className="space-y-4"><h3 className="text-lg font-semibold">5. 주문방식</h3><div className="space-y-2"><Label>주문 유형</Label><Select value={draft.orderPolicy.type} onValueChange={v=>u({orderPolicy:{...draft.orderPolicy,type:v as typeof ORDER_TYPES[number]}})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="LIMIT">지정가</SelectItem><SelectItem value="MARKET">시장가</SelectItem><SelectItem value="BEST">최유리</SelectItem></SelectContent></Select></div>{providerCapabilities?.timeInForce&&providerCapabilities.timeInForce.length>0&&<div className="space-y-2"><Label>Time in Force</Label><Select value={draft.orderPolicy.timeInForce??""} onValueChange={v=>u({orderPolicy:{...draft.orderPolicy,timeInForce:v as"ioc"|"fok"|"post_only"}})}><SelectTrigger><SelectValue placeholder="없음 (GTC)"/></SelectTrigger><SelectContent>{providerCapabilities.timeInForce.map(t=>(<SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>))}</SelectContent></Select></div>}</div>)}

    {step===5&&(<div className="space-y-4"><h3 className="text-lg font-semibold">6. 포지션 크기</h3><div className="space-y-2"><Label>사이징 방식</Label><Select value={draft.sizingPolicy.mode} onValueChange={v=>u({sizingPolicy:{...draft.sizingPolicy,mode:v as typeof SIZING_MODES[number]}})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="fixed_quantity">고정 수량</SelectItem><SelectItem value="fixed_quote_amount">고정 금액</SelectItem><SelectItem value="portfolio_ratio">포트폴리오 비율</SelectItem><SelectItem value="risk_based">위험 기반</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>값</Label><Input value={draft.sizingPolicy.value} onChange={e=>u({sizingPolicy:{...draft.sizingPolicy,value:e.target.value}})} placeholder={draft.sizingPolicy.mode==="fixed_quantity"?"수량 (예: 1)":"금액/비율 (예: 100000)"}/></div></div>)}

    {step===6&&(<div className="space-y-4"><h3 className="text-lg font-semibold">7. 위험 관리</h3><div className="space-y-2"><Label>실행 모드</Label><Select value={draft.executionMode} onValueChange={v=>u({executionMode:v as TradingExecutionMode})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{TRADING_EXECUTION_MODES.map(m=>(<SelectItem key={m} value={m}>{ml(m)}</SelectItem>))}</SelectContent></Select></div><div className="space-y-2"><Label>위험 정책 ID</Label><Input value={draft.riskPolicyId} onChange={e=>u({riskPolicyId:e.target.value})}/></div></div>)}

    {step===7&&(<div className="space-y-4"><h3 className="text-lg font-semibold">8. 검증 상태</h3><div className="rounded-lg border p-4 space-y-3">
      <Row label="문법 검증" ok={verif.syntax}/>
      <Row label="백테스트" stat={verif.backtest}/>
      <Row label="Paper Trading" stat={verif.paper}/>
      <Row label={`주문 테스트${verif.orderTest==="unsupported"?" (미지원)":""}`} stat={verif.orderTest==="unsupported"?"미지원":verif.orderTest} unsupported={verif.orderTest==="unsupported"}/>
      <Row label="실거래" stat={verif.live}/>
    </div>{draft.executionMode!=="disabled"&&<p className="text-xs text-muted-foreground">저장 후 Paper Trading에서 전략을 검증한 후 실거래로 전환하세요.</p>}</div>)}

    <div className="mt-6 flex justify-between"><Button variant="outline" onClick={pv} disabled={step===0}>이전</Button><div className="flex gap-2">{onCancel&&<Button variant="outline" onClick={onCancel}>취소</Button>}{step<7?<Button onClick={nx}>다음</Button>:<Button onClick={()=>onSave?.(draft)} disabled={!verif.syntax}>저장</Button>}</div></div>
  </div>)
}

function Row({label,ok,stat,unsupported}:{label:string;ok?:boolean;stat?:string;unsupported?:boolean}){
  return(<div className="flex items-center justify-between"><span className="text-sm">{label}</span>{ok!==undefined?<Badge variant={ok?"primary":"destructive"} size="sm">{ok?"통과":"미완료"}</Badge>:unsupported?<Badge variant="muted" size="sm">미지원</Badge>:<Badge variant={stat==="none"?"muted":"primary"} size="sm">{stat==="none"?"미실행":stat}</Badge>}</div>)
}

function ConditionEditor({group,onChange}:{group:StrategyRuleGroup;onChange:(g:StrategyRuleGroup)=>void}){
  return(<div className="space-y-3"><div className="flex items-center gap-2"><Label className="text-xs">논리</Label><Select value={group.logic} onValueChange={v=>onChange({...group,logic:v as"and"|"or"})}><SelectTrigger className="w-20 h-7 text-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="and">AND</SelectItem><SelectItem value="or">OR</SelectItem></SelectContent></Select></div>
    {group.conditions.map((cond,i)=>(<div key={i} className="flex items-center gap-2 rounded border p-2"><Select value={cond.source} onValueChange={v=>{const c=[...group.conditions];c[i]={...c[i],source:v as StrategyCondition["source"]};onChange({...group,conditions:c})}}><SelectTrigger className="w-32 h-7 text-xs"><SelectValue/></SelectTrigger><SelectContent>{STRATEGY_CONDITION_SOURCES.map(s=>(<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select><Select value={cond.operator} onValueChange={v=>{const c=[...group.conditions];c[i]={...c[i],operator:v as StrategyCondition["operator"]};onChange({...group,conditions:c})}}><SelectTrigger className="w-24 h-7 text-xs"><SelectValue/></SelectTrigger><SelectContent>{STRATEGY_CONDITION_OPERATORS.map(o=>(<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select><Input className="h-7 w-20 text-xs" value={cond.value} onChange={e=>{const c=[...group.conditions];c[i]={...c[i],value:e.target.value};onChange({...group,conditions:c})}}/><Button variant="outline" size="sm" className="h-7 w-7 p-0 text-xs" onClick={()=>onChange({...group,conditions:group.conditions.filter((_,j)=>j!==i)})}>X</Button></div>))}
    <Button variant="outline" size="sm" onClick={()=>onChange({...group,conditions:[...group.conditions,{source:"price",operator:"gt",value:"0"}]})}>+ 조건 추가</Button>{group.conditions.length===0&&<p className="text-xs text-muted-foreground">조건이 없으면 항상 실행됩니다.</p>}</div>)
}
