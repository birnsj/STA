import ConfirmDialog from '../maps/ConfirmDialog.jsx'
import { MissionAccomplished, MissionFailed } from './MissionStory.jsx'
import { failedNpcNames, isMissionAccomplished, isMissionFailed } from '../../exploration/missionObjectives.js'

// The confirmations for Exit Mission and a member's Beam Out, and the Mission Accomplished / Mission Failed banners.
// ending: useMissionEnding's result.
export default function MissionEndDialogs({ state, ending }) {
  const { party } = state
  const id = ending.confirmBeamOutId
  const beamOutMember = id && party.memberIds.includes(id) && !party.members[id].beaming ? party.members[id] : null
  return (
    <>
      {ending.confirmExit && (
        <ConfirmDialog
          title="Exit Mission?"
          message={
            isMissionFailed(state)
              ? 'The whole away team beams out. The mission has failed.'
              : isMissionAccomplished(state)
              ? 'The whole away team beams out and the mission ends.'
              : 'The whole away team beams out and the mission ends. Not every objective is complete: the mission will be abandoned.'
          }
          confirmLabel="Exit Mission"
          onConfirm={() => {
            ending.cancelExit()
            ending.exitMission()
          }}
          onCancel={ending.cancelExit}
        />
      )}
      {beamOutMember && (
        <ConfirmDialog
          title={`Beam out ${beamOutMember.character.name}?`}
          message={`${beamOutMember.character.name} leaves the mission and can't come back. Once everyone has beamed out, the mission ends.`}
          confirmLabel="Beam Out"
          onConfirm={() => {
            ending.cancelBeamOut()
            ending.startBeamOut([beamOutMember.id])
          }}
          onCancel={ending.cancelBeamOut}
        />
      )}
      {ending.ending === 'accomplished' && <MissionAccomplished map={party.map} onExit={ending.exitMission} onReturn={ending.dismiss} />}
      {ending.ending === 'failed' && <MissionFailed map={party.map} names={failedNpcNames(state)} onExit={ending.exitMission} />}
    </>
  )
}
