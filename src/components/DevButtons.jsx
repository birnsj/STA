import AutofillButton from './AutofillButton.jsx'
import ClearButton from './ClearButton.jsx'
import ExportButton from './ExportButton.jsx'

export default function DevButtons({ onClear }) {
  return (
    <div className="dev-buttons" role="group" aria-label="Developer tools">
      <span className="dev-buttons-tag">Dev</span>
      <AutofillButton />
      <ClearButton onClear={onClear} />
      <ExportButton label="Export JSON" />
    </div>
  )
}
