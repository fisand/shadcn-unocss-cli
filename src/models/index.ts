export interface RemoteComponent {
  name: string
  type: string
  title: string
  description: string
  dependencies: string[]
  registryDependencies: string[]
  files: Array<{
    path: string
    content: string
    type: string
    target: string
  }>
}