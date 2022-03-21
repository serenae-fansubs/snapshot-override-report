function hasParam(param) {
  return !!(Object.keys(process.env).includes(`npm_config_${param}`) || process.argv.find((arg) => arg.includes(`--${param}`)));
}

function getParam(param, defaultValue='') {
  return (process.env[`npm_config_${param}`] || process.argv.find((arg) => arg.includes(`--${param}=`)) || defaultValue).split(`--${param}=`).pop();
}

export {
  hasParam,
  getParam
};
