// One CombatAction instance per reducer action type. The plain action objects ({ type, ... }) stay as they are, so the
// UI, the AI, replays and saves don't change; the reducer finds the behaviour here.
import { AimAction } from './AimAction.js'
import { AmbushAction } from './AmbushAction.js'
import { AssistAction } from './AssistAction.js'
import { AttackAction, RerollAction, ResolveAttackAction } from './AttackAction.js'
import { AttackObjectAction } from './AttackObjectAction.js'
import { CancelThreatAction } from './CancelThreatAction.js'
import { CounterattackDecisionAction, FatigueDecisionAction } from './DecisionActions.js'
import { BuyExtraMinorAction, BuySecondMajorAction } from './ExtraActionPurchase.js'
import { DirectAction } from './DirectAction.js'
import { FleeAction } from './FleeAction.js'
import { MoveAction } from './MoveAction.js'
import { SocialAction } from './SocialAction.js'
import { FirstAidAction, GuardAction, ScanAction } from './TaskAction.js'
import { EndTurnAction, SelectCombatantAction } from './TurnControlActions.js'

const ACTIONS = [
  new EndTurnAction(),
  new SelectCombatantAction(),
  new MoveAction('move'),
  new MoveAction('sprint'),
  new AimAction(),
  new AssistAction(),
  new BuyExtraMinorAction(),
  new BuySecondMajorAction(),
  new CancelThreatAction(),
  new GuardAction(),
  new FirstAidAction(),
  new ScanAction(),
  new SocialAction('persuade'),
  new SocialAction('intimidate'),
  new DirectAction(),
  new AmbushAction(),
  new FleeAction(),
  new AttackAction(),
  new RerollAction(),
  new ResolveAttackAction(),
  new AttackObjectAction(),
  new FatigueDecisionAction(),
  new CounterattackDecisionAction(),
]

// Every registered action, for questions asked of all of them (what can this combatant do now).
export const allCombatActions = () => ACTIONS

const BY_TYPE = new Map(ACTIONS.map((action) => [action.type, action]))

export const combatActionFor = (type) => BY_TYPE.get(type) ?? null
