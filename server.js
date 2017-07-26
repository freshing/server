const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const request = require('request');

const uri = 'https://git.jazzy.pro/api/v4/projects';
const token = {'PRIVATE-TOKEN': 'KARzqUSHywKqngixodt1'};

var projects = [];

getData();

setInterval(() => {
  var prevProjects = JSON.parse(JSON.stringify(projects));
  projects.forEach(project => {
    refreshJobs(1, prevProjects, project.id);
  })
}, 10000);

io.on('connection',
function(socket){
  socket.on('get',
  function(msg){
    socket.emit('pipelines', projects);
  });
});

http.listen(3000);

function getData() {
  request({
    method: 'GET',
    uri: uri,
    headers: token
    },
    function (error, response, body) {
      projects = JSON.parse(body);
      projects.forEach(project => {
        project.pipelines = [];
        project.jobs = [];
        getNumberOfPages(project.id);
      });
  });
}

function addPipeline(pipeline, projectID) {
  var index = getProjectIndex(projectID);
  if (index != -1)
  {
    getCommit(pipeline.sha, pipeline.id, projectID);
    var pipelinesLength = projects[index].pipelines.length;
    getPipeline(pipeline.id, projectID);
    for (var i=0; i<pipelinesLength; i++)
    {
      if (pipeline.id > projects[index].pipelines[i].id)
      {
        projects[index].pipelines.splice(i, 0, {id: pipeline.id, status: pipeline.status, ref: pipeline.ref, sha: pipeline.sha, project: projects[index].name_with_namespace});
        return;
      }
    }
    projects[index].pipelines.push({id: pipeline.id, status: pipeline.status, ref: pipeline.ref, sha: pipeline.sha, project: projects[index].name_with_namespace});
  }
}

function addToJobs(job, projectID) {
  var index = getProjectIndex(projectID);
  if (index != -1)
  {
    var currentLength = projects[index].jobs.length;
    for (var i=0; i<currentLength; i++)
    {
      if (projects[index].jobs[i].id == job.id)
      {
        projects[index].jobs.splice(i, 1, job);
        return;
      }
      else if (projects[index].jobs[i].id < job.id)
      {
        projects[index].jobs.splice(i, 0, job);
        return;
      }
    }
    projects[index].jobs.push(job);
  }
}

function assignToPipeline(job, pipelineIndex, projectIndex) {
  projects[projectIndex].pipelines[pipelineIndex].status = job.pipeline.status;
  if (!projects[projectIndex].pipelines[pipelineIndex].jobs)
  {
    projects[projectIndex].pipelines[pipelineIndex].jobs = [job];
  }
  else {
    var length = projects[projectIndex].pipelines[pipelineIndex].jobs.length;
    for (var i=0; i<length; i++)
    {
      if (projects[projectIndex].pipelines[pipelineIndex].jobs[i].id == job.id)
      {
        projects[projectIndex].pipelines[pipelineIndex].jobs.splice(i, 1, job);
        return;
      }
      else if (projects[projectIndex].pipelines[pipelineIndex].jobs[i].id > job.id)
      {
        projects[projectIndex].pipelines[pipelineIndex].jobs.splice(i, 0, job);
        return;
      }
    }
    projects[projectIndex].pipelines[pipelineIndex].jobs.push(job);
  }
}

function checkPipeline(job, projectID) {
  var index = getProjectIndex(projectID);
  if (index != -1)
  {
    var pipelinesLength = projects[index].pipelines.length;
    for (var i=0; i<pipelinesLength; i++)
    {
      if (job.pipeline.id == projects[index].pipelines[i].id)
      {
        return assignToPipeline(job, i, index);
      }
    }
    addPipeline(job.pipeline, projectID);
    checkPipeline(job, projectID);
  }
}

function compareArrays(array1, array2) {
  if (array1.length != array2.length){
    return true;
  }
  for(var i = 0; i<array1.length; i++) {
    if(JSON.stringify(array1[i]) != JSON.stringify(array2[i]))
    {
      return true;
    }
  }
  return false;
}

function getCommit(sha, pipelineID, projectID) {
  request({
    method: 'GET',
    uri: uri + '/' + projectID + '/repository/commits/' + sha,
    headers: token
    }, function (error, response, body) {
      var projectIndex = getProjectIndex(projectID);
      if (projectIndex != -1)
      {
        var pipelineIndex = getPipelineIndex(projectID, pipelineID);
        if (pipelineIndex != -1)
        {
          projects[projectIndex].pipelines[pipelineIndex].commit = JSON.parse(body);
        }
      }
  });
}

function getPipelineIndex(projectID, pipelineID) {
  var index = getProjectIndex(projectID);
  if (index != -1)
  {
    var pipelinesLength = projects[index].pipelines.length;
    for (var i=0; i<pipelinesLength; i++)
    {
      if (pipelineID == projects[index].pipelines[i].id)
      {
        return i;
      }
    }
  }
  return -1;
}

function getProjectIndex(id) {
  var projectsLength = projects.length;
  for (var i=0; i<projectsLength; i++)
  {
    if (id == projects[i].id)
    {
      return i;
    }
  }
  return -1;
}

function getPipeline(pipelineID, projectID) {
  request({
    method: 'GET',
    uri: uri + '/' + projectID + '/pipelines/' + pipelineID,
    headers: token
    }, function (error, response, body) {
      var projectIndex = getProjectIndex(projectID);
      if (projectIndex != -1)
      {
        var pipelineIndex = getPipelineIndex(projectID, pipelineID);
        if (pipelineIndex != -1)
        {

          projects[projectIndex].pipelines[pipelineIndex].user = JSON.parse(body).user;
          projects[projectIndex].pipelines[pipelineIndex].coverage = JSON.parse(body).coverage;
        }
      }
  });
}

function getNumberOfPages(id) {
  request({
    method: 'GET',
    uri: uri + '/' + id + '/jobs',
    headers: token
    }, function (error, response, body) {
    var totalPages = response.toJSON().headers['x-total-pages'];
    getJobs(0, totalPages, id);
  });
}

function getJobs(page, total, id) {
  var date = new Date();
  date.setMonth(date.getMonth()-1);
  var flag = true;
  if (page === 0)
  {
    var index = getProjectIndex(id);
    if (index != -1)
    {
      jobs = [];
      pipelines = [];
      getJobs(1, total, id);
    }
  }
  else {
    request({
      method: 'GET',
      uri: uri + '/' + id + '/jobs?page=' + page,
      headers: token
    }, function (error, response, body) {
      var receivedJobs = JSON.parse(body);
      receivedJobs.forEach(job => {
        if (new Date(job.created_at) > date)
        {
          addToJobs(job, id);
          checkPipeline(job, id);
        }
        else {
          flag = false;
        }
      });
      if (flag && page <= total)
      {
        getJobs(page+1, total, id);
      }
    });
  }
}

function getLastJobId(projectID) {
  var index = getProjectIndex(projectID);
  if (index != -1)
  {
    var id;
    projects[index].jobs.forEach(job => {
      if (job.status == 'running' || job.status == 'created' || job.status == 'pending' || job.status == 'manual')
      {
        id = job.id;
      }
    });
    return id ? id : projects[index].jobs[0] ? projects[index].jobs[0].id + 1 : 0;
  }
}

function refreshJobs(page, prev, projectID, lastId) {
  var date = new Date();
  date.setMonth(date.getMonth()-1);
  if (page == 1)
  {
    lastId = getLastJobId(projectID);
  }
  var flag = false;
    request({
      method: 'GET',
      uri: uri + '/' + projectID + '/jobs?page=' + page,
      headers: token
    }, function (error, response, body) {
      var newJobs = JSON.parse(body);
      newJobs.forEach(job => {
        if ((job.id >= lastId) && (new Date(job.created_at) > date))
        {
          addToJobs(job, projectID);
          checkPipeline(job, projectID);
          flag = true;
        }
        else {
          flag = false;
        }
      });
      if (flag)
      {
        refreshJobs(page+1, prev, projectID, lastId);
      }
      var index = getProjectIndex(projectID);
      if (index != -1){
        if (compareArrays(projects, prev))
        {
          io.emit('pipelines', projects);
        }
      }
    });
}
