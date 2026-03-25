import type { Course } from '../lib/types'

export default function CourseCard({ course }: { course: Course }) {
  return (
    <div className="course-card">
      <div className="course-media">
        <img className="course-image" src={course.image} alt={course.title} />
      </div>

      <div className="course-content">
        <div className="course-pill">{course.level}</div>
        <h3 className="course-title">{course.title}</h3>
        <p className="course-tagline">{course.tagline}</p>
        <p className="course-desc">{course.description}</p>

        <div className="course-footer">
          <div className="course-price">
            <span className="course-price-label">Price</span>
            <span className="course-price-value">${course.price}</span>
          </div>
          <button className="neon-btn neon-btn--ghost" type="button">
            Preview
          </button>
        </div>
      </div>
    </div>
  )
}

