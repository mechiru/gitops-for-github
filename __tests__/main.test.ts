import {diff, extension, Config, readConfigFile} from '../src/main';

test('test diff', () => {
  [
    {in: {a: [], b: []}, want: [[], []]},
    {in: {a: ['a'], b: []}, want: [['a'], []]},
    {in: {a: [], b: ['a']}, want: [[], ['a']]},
    {in: {a: ['a', 'b'], b: ['a', 'c']}, want: [['b'], ['c']]}
  ].forEach(x => expect(diff(x.in.a, x.in.b)).toStrictEqual(x.want));
});

test('test extention', () => {
  [
    {in: 'file.json', want: 'json'},
    {in: 'hoge.file.jsonc', want: 'jsonc'},
    {in: 'my.config.file.yaml', want: 'yaml'}
  ].forEach(x => expect(extension(x.in)).toStrictEqual(x.want));
});

test('test readConfigFile', async () => {
  const want: Config = {
    members: [
      {login: 'mechiru', email: 'mechiru@mechiru.test'},
      {login: 'mechiru2', email: 'mechiru2@mechiru.test'}
    ]
  };

  const cases = [
    {in: '__tests__/data/config.json', want},
    {in: '__tests__/data/config.yaml', want}
  ];

  for (const c of cases) {
    const config = await readConfigFile(c.in);
    expect(config).toStrictEqual(c.want);
  }
});
