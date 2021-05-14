import {diff} from '../src/main';

test('test diff', () => {
  [
    {in: {a: [], b: []}, want: [[], []]},
    {in: {a: ['a'], b: []}, want: [['a'], []]},
    {in: {a: [], b: ['a']}, want: [[], ['a']]},
    {in: {a: ['a', 'b'], b: ['a', 'c']}, want: [['b'], ['c']]}
  ].forEach(x => expect(diff(x.in.a, x.in.b)).toStrictEqual(x.want));
});
