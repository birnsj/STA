import { useState } from 'react'
import ConfirmDialog from './ConfirmDialog.jsx'
import TextDialog from './TextDialog.jsx'

// The map editor's in-editor popups, as promises so a handler can `await` the answer.
// askConfirm({ title, message, confirmLabel }) resolves true when confirmed.
// askText({ title, message, initialValue, ... }) resolves with the text, or null when cancelled.
// dialogs: the popups to render (nothing while none is open). open: whether one is showing, so the editor's own keys stand aside.
export default function useDialogs() {
  // The open confirm popup: { title, message, confirmLabel, resolve }.
  const [question, setQuestion] = useState(null)
  // The open text box (area label or map name) and the promise waiting on it.
  const [textQuestion, setTextQuestion] = useState(null)

  const askConfirm = (details) => new Promise((resolve) => setQuestion({ ...details, resolve }))
  const askText = (details) => new Promise((resolve) => setTextQuestion({ ...details, resolve }))
  const answerText = (value) => {
    textQuestion.resolve(value)
    setTextQuestion(null)
  }
  const answer = (confirmed) => {
    question.resolve(confirmed)
    setQuestion(null)
  }

  const dialogs = (
    <>
      {textQuestion && (
        <TextDialog
          title={textQuestion.title}
          message={textQuestion.message}
          initialValue={textQuestion.initialValue}
          placeholder={textQuestion.placeholder}
          saveLabel={textQuestion.saveLabel}
          removeLabel={textQuestion.removeLabel}
          maxLength={textQuestion.maxLength}
          onSave={answerText}
          onCancel={() => answerText(null)}
        />
      )}
      {question && (
        <ConfirmDialog
          title={question.title}
          message={question.message}
          confirmLabel={question.confirmLabel}
          onConfirm={() => answer(true)}
          onCancel={() => answer(false)}
        />
      )}
    </>
  )

  return { askConfirm, askText, dialogs, open: Boolean(question) || Boolean(textQuestion) }
}
