import { Building, User, Video, Briefcase } from 'lucide-react'

export function getResourceIcon(type: string) {
  switch (type) {
    case 'room':
      return Building
    case 'person':
      return User
    case 'virtual':
      return Video
    default:
      return Briefcase
  }
}

interface ResourceTypeLabels {
  roomTypeLabel: string
  personType: string
  virtualType: string
  equipmentType: string
}

export function getResourceTypeLabel(type: string, t: ResourceTypeLabels) {
  if (type === 'room') return t.roomTypeLabel
  if (type === 'person') return t.personType
  if (type === 'virtual') return t.virtualType
  return t.equipmentType
}
