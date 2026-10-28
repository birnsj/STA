import {
  isFinishingTouchesComplete,
  isMissionProfileComplete,
  isRefitsFinished,
  isServiceRecordFinished,
} from './shipModel.js'

export function isShipStepComplete(stepId, ship) {
  switch (stepId) {
    case 'timeframe':
      return Boolean(ship.timeframeId && Number.isFinite(ship.campaignYear))
    case 'spaceframe':
      return Boolean(ship.spaceframeId)
    case 'missionProfile':
      return isMissionProfileComplete(ship)
    case 'serviceRecord':
      return isServiceRecordFinished(ship)
    case 'refits':
      return isRefitsFinished(ship)
    case 'finishingTouches':
      return isFinishingTouchesComplete(ship)
    case 'review':
      return Boolean(ship.confirmedAt)
    default:
      return false
  }
}

export function getCompletedShipStepIds(ship, stepIds) {
  return stepIds.filter((id) => isShipStepComplete(id, ship))
}
