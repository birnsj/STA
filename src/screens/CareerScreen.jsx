import { useCharacter } from '../character/useCharacter.js'
import {
  getAssignmentBlock,
  getAssignmentById,
  getAssignments,
  getCareerLengthById,
  getCareerLengths,
  getCareerRequirements,
  getDepartmentFor,
  getDepartments,
  getMinimumRank,
  getRankOptions,
  getRankType,
  isAboveNoviceCap,
  isBelowVeteranFloor,
  getValueExamples,
  getValueMatrix,
  isCustomValueAllowed,
  isDepartmentChoice,
  isRankAllowed,
  isRoleChoice,
} from '../rules/career.js'
import { getRoleById, getRoles } from '../rules/roles.js'
import { getValuesHeldElsewhere } from '../rules/characterSheet.js'
import { areAllMet, getLockedSections } from '../rules/requirements.js'
import CardCarousel from '../components/CardCarousel.jsx'
import ChoiceList from '../components/ChoiceList.jsx'
import { getAssignmentTip, getRankTip } from '../rules/infoTips.js'
import HelpTip from '../components/HelpTip.jsx'
import MechanicsColumn from '../components/MechanicsColumn.jsx'
import Portrait from '../components/Portrait.jsx'
import ScreenFooter from '../components/ScreenFooter.jsx'
import TalentColumn from '../components/TalentColumn.jsx'
import ValuePicker from '../components/ValuePicker.jsx'
import ChipGroup from '../components/ChipGroup.jsx'

// Rank type comes from the Career Path (see career.json rankTypeByEducation).
const RANK_INSTRUCTIONS = {
  officer: (minimum) => `Choose your rank.${minimum ? ` Minimum: ${minimum.name}.` : ''}`,
  optional: (minimum) => `Diplomats and civilians hold No Rank unless you choose an officer rank.${minimum ? ` Minimum if ranked: ${minimum.name}.` : ''}`,
  enlisted: () => 'Your Career Path makes you enlisted. Choose your rank.',
}

function DepartmentPicker({ department, onSelect }) {
  return (
    <ChipGroup
      label="Department"
      options={getDepartments().map((entry) => ({ id: entry.id, label: entry.name }))}
      value={department?.id ?? ''}
      onChange={onSelect}
      missing={!department}
    />
  )
}

// Role and Role Benefit (STA 2E Core pp.135–138), shown with the assignment that sets them.
function RoleDetails({ career, onSelectRole }) {
  const role = getRoleById(career.role?.id)
  return (
    <div className="career-role">
      <p className="career-detail-line">
        <span className="education-book-label">Role:</span>{' '}
        {role ? role.name : 'Choose one.'}
        {role && !isRoleChoice(career) && <span className="career-role-note"> (set by your assignment)</span>}
      </p>
      {isRoleChoice(career) && (
        <ChipGroup
          label="Role"
          options={getRoles().map((entry) => ({ id: entry.id, label: entry.name, title: entry.benefit.description }))}
          value={role?.id ?? ''}
          onChange={onSelectRole}
          missing={!role}
        />
      )}
      {role && (
        <>
          <p className="career-detail-line career-role-benefit">
            <span className="education-book-label">Role Benefit:</span> {role.benefit.description}
          </p>
          <p className="source-ref">STA 2E Core Rulebook, p.{role.source.page} · Requirements: none</p>
        </>
      )}
    </div>
  )
}

function AssignmentDetails({ assignment, career, rankType, locked, onSelectDepartment, onSelectRole }) {
  return (
    <div className={`panel env-column career-assignment-details${locked ? ' is-locked' : ''}`} inert={locked}>
      <h3 className="env-column-title"><HelpTip helpId="assignmentDetails">Assignment Details</HelpTip></h3>
      <div className="env-column-body">
        {assignment ? (
          <>
            <p className="career-detail-name">{assignment.name}</p>
            {isDepartmentChoice(career) ? (
              <>
                <p className="career-detail-line">
                  <span className="education-book-label">Department:</span> None stated in the book — choose one.
                </p>
                <DepartmentPicker department={career.department} onSelect={onSelectDepartment} />
              </>
            ) : (
              <p className="career-detail-line">
                <span className="education-book-label">Department:</span> {getDepartmentFor(assignment.id)?.name}
              </p>
            )}
            {rankType !== 'enlisted' && getMinimumRank(assignment.id) && (
              <p className="career-detail-line">
                <span className="education-book-label">Minimum rank:</span> {getMinimumRank(assignment.id).name}
                {rankType === 'optional' && ' (if ranked)'}
              </p>
            )}
            <RoleDetails career={career} onSelectRole={onSelectRole} />
            <p className="education-detail-description">{assignment.description}</p>
            <p className="source-ref">{assignment.source.book}, p.{assignment.source.page}</p>
          </>
        ) : (
          <p className="education-detail-description">Select an assignment to see its details.</p>
        )}
      </div>
    </div>
  )
}

export default function CareerScreen({ step, navigation }) {
  const { character, dispatch } = useCharacter()
  const { career } = character
  const requirements = getCareerRequirements(character)
  const locked = getLockedSections(requirements)

  const length = getCareerLengthById(career.length?.id)
  const lengthCard = getCareerLengths().find((entry) => entry.id === length?.id)
  const assignment = getAssignmentById(career.assignment?.id)
  const minimumRank = assignment ? getMinimumRank(assignment.id) : null
  const rankType = getRankType(character)

  return (
    <section className="screen career-screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className={`screen-heading${requirements.length ? '' : ' is-missing'}`}><HelpTip helpId={`${step.id}Screen`}>{step.title}</HelpTip></h1>
          <p className="screen-intro">
            Choose your Experience, then your assignment and rank. Your Experience gives you one Value; your assignment sets your department.
          </p>
        </div>
      </div>

      <CardCarousel
        label="Experience"
        variant={`carousel-environment${requirements.length ? '' : ' is-missing'}`}
        items={getCareerLengths()}
        selectedId={length?.id ?? null}
        onSelect={(lengthId) => dispatch({ type: 'selectCareerLength', lengthId })}
      />

      <div className="species-details env-details panel">
        <Portrait label={length?.name} image={lengthCard?.image} className="portrait-detail" />
        <div className="species-details-text">
          <h2 className="species-details-name">{length?.name ?? 'No Experience selected'}</h2>
          <p>{length?.description ?? 'Select an Experience above.'}</p>
          {length && (
            <>
              <p className="career-value-prompt">
                <span className="education-book-label">Value:</span> {length.valuePrompt}
              </p>
              {length.age && (
                <p className="career-value-prompt">
                  <span className="education-book-label">Age:</span> {length.age}
                </p>
              )}
              <p className="source-ref">STA 2E Core Rulebook, p.{length.source.page}</p>
            </>
          )}
        </div>
      </div>

      <div className="env-mechanics career-mechanics">
        {/* Values are remembered per length (choiceMemory.js), so a value chosen before a length would be lost. */}
        <MechanicsColumn
          number="1"
          title="Career Value"
          helpId="careerValue"
          instruction={length ? `Choose a value that fits your Experience${isCustomValueAllowed() ? ', or write your own' : ''}.` : 'Select an Experience to choose its Value.'}
          instructionLines={3}
          met={requirements.value}
          locked={locked.value}
        >
          {length && (
            <ValuePicker
              value={career.value}
              examples={getValueExamples(length.id)}
              matrix={getValueMatrix()}
              allowCustom={isCustomValueAllowed()}
              onSelectMatrix={(valueId) => dispatch({ type: 'selectCareerMatrixValue', valueId })}
              onCustomChange={(text) => dispatch({ type: 'setCareerCustomValue', text })}
              heldElsewhere={getValuesHeldElsewhere(character, 'career')}
            />
          )}
        </MechanicsColumn>

        <MechanicsColumn
          number="2"
          title="Assignment"
          helpId="careerAssignment"
          instruction="Choose your job aboard ship. It sets your department and your role."
          instructionLines={3}
          met={requirements.assignment}
          locked={locked.assignment}
        >
          <ChoiceList
            label="Assignment"
            options={getAssignments().map((entry) => {
              const block = getAssignmentBlock(character, entry.id)
              return {
                id: entry.id,
                label: entry.name,
                suffix: block ?? getDepartmentFor(entry.id)?.name ?? 'Choose',
                disabled: Boolean(block),
                tip: getAssignmentTip(entry, block),
              }
            })}
            selectedId={assignment?.id}
            onSelect={(assignmentId) => dispatch({ type: 'selectCareerAssignment', assignmentId })}
          />
        </MechanicsColumn>

        <AssignmentDetails
          assignment={assignment}
          career={career}
          rankType={rankType}
          locked={locked.assignment}
          onSelectDepartment={(departmentId) => dispatch({ type: 'selectCareerDepartment', departmentId })}
          onSelectRole={(roleId) => dispatch({ type: 'selectCareerRole', roleId })}
        />

        <MechanicsColumn
          number="3"
          title="Rank"
          helpId="careerRank"
          instruction={assignment ? RANK_INSTRUCTIONS[rankType](minimumRank) : 'Select an assignment to choose a rank.'}
          instructionLines={3}
          met={requirements.rank}
          locked={locked.rank}
        >
          <ChoiceList
            label="Rank"
            options={[...getRankOptions(character)].reverse().map((rank) => ({
              id: rank.id,
              label: rank.name,
              disabled: !isRankAllowed(character, rank.id),
              suffix: isAboveNoviceCap(character, rank.id) ? 'Not for Novice' : isBelowVeteranFloor(character, rank.id) ? 'Not for Veteran' : undefined,
              tip: getRankTip(rank.id),
            }))}
            selectedId={career.rank?.id}
            onSelect={(rankId) => dispatch({ type: 'selectCareerRank', rankId })}
          />
        </MechanicsColumn>

        <TalentColumn number="4" stepId="career" met={requirements.talent} locked={locked.talent} />
      </div>

      <ScreenFooter {...navigation} canGoNext={navigation.canGoNext && areAllMet(requirements)} />
    </section>
  )
}
