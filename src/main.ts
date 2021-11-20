import * as core from '@actions/core';
import {PaginateInterface, paginateRest} from '@octokit/plugin-paginate-rest';
import {Octokit} from '@octokit/core';
import {throttling} from '@octokit/plugin-throttling';
import {readFileSync} from 'fs';
import {jsonc} from 'jsonc';
import {parse} from 'yaml';

// https://docs.github.com/en/rest/reference
type MyOctokit = Octokit & {paginate: PaginateInterface};

type Input = Readonly<{
  file: string;
  organization: string;
  token: string;
  dryRun: boolean;
}>;

function parseInput(): Input {
  return {
    organization: core.getInput('organization'),
    file: core.getInput('file'),
    token: core.getInput('token'),
    dryRun: core.getInput('dry-run') === 'true'
  };
}

export type Config = Readonly<{
  members: Member[];
}>;

export type Member = Readonly<{
  login: string;
  email: string;
}>;

async function listMembers(octokit: MyOctokit, org: string): Promise<string[]> {
  const resp = await octokit.paginate('GET /orgs/{org}/members', {org, per_page: 100});
  return resp.filter(x => x != null).map(x => x.login);
}

async function inviteMembers(
  octokit: MyOctokit,
  params: {org: string; members: Member[]; dryRun: boolean}
): Promise<void> {
  const failed: {[key: string]: {login: string | null; email: string | null}} = {};
  for await (const resp of octokit.paginate.iterator('GET /orgs/{org}/failed_invitations', {
    org: params.org,
    per_page: 100
  })) {
    for (const x of resp.data) {
      if (x?.login != null) {
        failed[x.login] = x;
      }
    }
  }

  const pending: {[key: string]: {login: string | null; email: string | null}} = {};
  for await (const resp of octokit.paginate.iterator('GET /orgs/{org}/invitations', {
    org: params.org,
    per_page: 100
  })) {
    for (const x of resp.data) {
      if (x?.login != null) {
        pending[x.login] = x;
      }
    }
  }

  core.debug(`failed: ${JSON.stringify(Object.keys(failed))}`);
  core.debug(`pending: ${JSON.stringify(Object.keys(pending))}`);

  for (const x of params.members) {
    let invite = true;

    if (failed[x.login] != null) {
      core.info(`'${x.login}' is already invited, but status is failed`);
      invite = failed[x.login].email !== x.email;
      if (invite) {
        core.info(`'${x.login}' email updated, reinvite to organization`);
      }
    }

    if (pending[x.login] != null) {
      invite = false;
      core.info(`'${x.login}' is already invited, but status is pending`);
    }

    if (invite) {
      if (params.dryRun) {
        core.info(`dryRun: invite '${x.login}' to organization`);
        continue;
      }

      const resp = await octokit.request('POST /orgs/{org}/invitations', {
        org: params.org,
        email: x.email,
        role: 'direct_member'
      });
      if (resp.status !== 201) {
        throw new Error(`response status code error: ${resp.status}`);
      }
      core.info(`invited '${x.login}' to organization`);
    }
  }
}

// TODO: remove invitation
async function removeMembers(
  octokit: Octokit,
  params: {org: string; logins: string[]; dryRun: boolean}
): Promise<void> {
  for (const x of params.logins) {
    if (params.dryRun) {
      core.info(`dryRun: remove '${x}' from organization`);
      continue;
    }

    const resp = await octokit.request('DELETE /orgs/{org}/members/{username}', {
      org: params.org,
      username: x
    });
    if (resp.status !== 204) {
      throw new Error(`response status code error: ${resp.status}`);
    }
    core.info(`removed '${x}' from organization`);
  }
}

export function diff(desired: string[], current: string[]): [string[], string[]] {
  const add = [];

  const set = new Set(current);
  for (const x of desired) {
    if (!set.delete(x)) {
      add.push(x);
    }
  }

  return [add, Array.from(set)];
}

export function extension(path: string): string | undefined {
  return path.split('.').pop();
}

export async function readConfigFile(path: string): Promise<Config> {
  const file = readFileSync(path, {encoding: 'utf8'}); // TODO: fs/promise.readFile
  core.debug(`config: ${file}`);
  switch (extension(path)) {
    case 'yml':
    case 'yaml':
      return parse(file) as Config;
    case undefined:
    case 'json':
    case 'jsonc':
    default:
      return jsonc.parse(file) as Config;
  }
}

async function inner(input: Input): Promise<Readonly<{invite: string[]; remove: string[]}>> {
  const config = await readConfigFile(input.file);

  const octokit: MyOctokit = new (Octokit.plugin(paginateRest, throttling))({
    auth: input.token,
    throttle: {
      onRateLimit: (
        retryAfter: number,
        options: {method: string; url: string; request: {retryCount: number}},
        octokit: Octokit
      ) => {
        octokit.log.warn(`request quota exhausted for request ${options.method} ${options.url}`);

        if (options.request.retryCount === 0) {
          octokit.log.info(`retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      onAbuseLimit: (
        retryAfter: number,
        options: {method: string; url: string},
        octokit: Octokit
      ) => {
        octokit.log.warn(`abuse detected for request ${options.method} ${options.url}`);
      }
    }
  });
  const members = await listMembers(octokit, input.organization);
  core.debug(`members: ${members}`);

  const [add, sub] = diff(
    config.members.map(x => x.login),
    members
  );
  core.debug(`add: ${add}`);
  core.debug(`sub: ${sub}`);

  await removeMembers(octokit, {org: input.organization, logins: sub, dryRun: input.dryRun});
  await inviteMembers(octokit, {
    org: input.organization,
    members: config.members.filter(x => add.includes(x.login)),
    dryRun: input.dryRun
  });

  return {invite: add, remove: sub};
}

async function run(): Promise<void> {
  try {
    const input = parseInput();
    core.debug(`input: ${JSON.stringify(input)}`);

    const {invite, remove} = await inner(input);

    core.setOutput('invite', invite);
    core.setOutput('remove', remove);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`message: ${error.message}\nstack: ${error.stack}`);
    }
  }
}

run();
