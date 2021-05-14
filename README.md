# gitops-for-github

[![ci](https://github.com/mechiru/gitops-for-github/workflows/ci/badge.svg)](https://github.com/mechiru/gitops-for-github/actions?query=workflow:ci)
![Dependabot](https://api.dependabot.com/badges/status?host=github&repo=mechiru/gitops-for-github)

GitOps for GitHub(Beta).

## Example workflow

$repo/github.json:
```json
{
  "members": [
    { "login": "mechiru", "email": "some-valid-email" }
  ]
}
```

workflow:
```yaml
name: gitops-for-github

on:
  push:
    branches: [master]

jobs:
  operation:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: mechiru/gitops-for-github@master
        with:
          organization: your-organization-name
          file: $repo/github.json
          token: ${{ secrets.MY_GITHUB_API_TOKEN }}
          dry-run: true
```

See [action.yml](./action.yml).

## License

This Action is distributed under the terms of the MIT license, see [LICENSE](./LICENSE) for details.

## Contribute and support

Any contributions are welcomed!
