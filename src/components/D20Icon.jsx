// A d20 drawn as a line icon (an icosahedron seen face on), in the text colour of whatever holds it.
export default function D20Icon({ className = 'd20-icon' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M12 2 21 7v10l-9 5-9-5V7z" />
      <path d="M12 7l5 8H7z" />
      <path d="M3 7l9 0 9 0M3 7l4 8M21 7l-4 8M3 17l4-2M21 17l-4-2M12 22l-5-7M12 22l5-7" />
    </svg>
  )
}
