// Prototype presentation rule (not book mechanics): the shirt colour a character's portrait wears, from their department.
import uniformData from '../data/adaptation/uniforms.json'

const divisionsById = new Map(uniformData.divisions.map((division) => [division.id, division]))

export const getDivisionForDepartment = (departmentId) =>
  uniformData.divisions.find((division) => division.departments.includes(departmentId)) ?? divisionsById.get(uniformData.noDepartmentDivision)

export const getUniformColour = (departmentId) => getDivisionForDepartment(departmentId)?.colour ?? null

export const getMockShirtArt = () => uniformData.mockArt
