import ScreenFooter from '../components/ScreenFooter.jsx'

// Development stand-in for creation stages that have not been designed/implemented yet.
export default function PlaceholderScreen({ step, navigation }) {
  return (
    <section className="screen">
      <div className="screen-title">
        <div className="screen-title-heading">
          <span className="screen-number">{step.number}</span>
          <h1 className="screen-heading">{step.title}</h1>
        </div>
        <p className="screen-intro">Not yet implemented.</p>
      </div>
      <div className="panel placeholder-body">
        <p>Screen {step.number} ({step.title}) is a development placeholder. Its design has not been provided yet.</p>
      </div>
      <ScreenFooter {...navigation} canGoNext={false} />
    </section>
  )
}
