const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const app = express();
var format = require("date-fns/format");
var isMatch = require("date-fns/isMatch");
var isValid = require("date-fns/isValid");
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3030;

const dbPath = path.join(__dirname, "UsersTask.db");

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(PORT, () => {
      console.log(`server started on port ${PORT}`);
    });
  } catch (error) {
    console.log(`DB Error : ${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const validatePassword = (password) => {
  return password.length > 5;
};

const authentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken) {
    jwt.verify(jwtToken, "SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        // request.userId = payload.id;
        // console.log(payload.id);
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

const convertDataIntoResponseObject = (dbObject) => {
  return {
    taskId: dbObject.id,
    todo: dbObject.todo,
    category: dbObject.category,
    priority: dbObject.priority,
    status: dbObject.status,
    dueDate: dbObject.due_date,
    assigneeId: dbObject.assignee_id,
  };
};

const accessVerification = async (request, response, next) => {
  const { username } = request;
  console.log(username);
  const { taskId } = request.params;
  console.log(taskId);
  const getTaskQuery = `SELECT * FROM TASKS INNER JOIN USERS 
    WHERE TASKS.task_id = ${taskId} AND USERS.username = '${username}';`;
  const task = await database.get(getTaskQuery);
  console.log(task);
  if (task === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

const hasPriorityAndStatusProperties = (requestQuery) => {
  return (
    requestQuery.priority !== undefined && requestQuery.status !== undefined
  );
};

const hasPriorityProperty = (requestQuery) => {
  return requestQuery.priority !== undefined;
};

const hasStatusProperty = (requestQuery) => {
  return requestQuery.status !== undefined;
};

const hasCategoryProperty = (requestQuery) => {
  return requestQuery.category !== undefined;
};

const hasCategoryAndStatusProperties = (requestQuery) => {
  return (
    requestQuery.category !== undefined && requestQuery.status !== undefined
  );
};

const hasCategoryAndPriorityProperties = (requestQuery) => {
  return (
    requestQuery.category !== undefined && requestQuery.priority !== undefined
  );
};

const hasSearchProperty = (requestQuery) => {
  return requestQuery.search_q !== undefined;
};

app.post("/register", async (request, response) => {
  const { username, name, password, gender, contact_number } = request.body;
  const hashPass = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM USERS
     WHERE username='${username}';`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `INSERT INTO USERS (username, name, password, gender, contacts)
        VALUES (
            '${username}',
            '${name}',
            '${hashPass}',
            '${gender}',
            '${contact_number}'
            );`;
    if (validatePassword(password)) {
      await database.run(createUserQuery);
      response.send("user created successfully");
    } else {
      response.status(400);
      response.send("password is too short");
    }
  } else {
    response.status(400);
    response.send("user is already exist");
  }
});
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM USERS WHERE username = '${username}'`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser !== undefined) {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

app.put("/change-password", authentication, async (request, response) => {
  const { username, oldPassword, newPassword } = request.body;
  const selectUserQuery = `SELECT * FROM USERS
      WHERE username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid User");
  } else {
    const comparePass = await bcrypt.compare(oldPassword, dbUser.password);
    if (comparePass) {
      if (validatePassword(newPassword)) {
        const hashedPass = await bcrypt.hash(newPassword, 10);
        const updateUserQuery = `UPDATE USERS
                    SET password = '${hashedPass}'
                    WHERE username = '${username}';`;
        await database.run(updateUserQuery);
        response.send("password updated successfully");
      } else {
        response.status(400);
        response.send("password is too short");
      }
    } else {
      response.status(400);
      response.send("invalid password");
    }
  }
});

app.get("/todos/", authentication, async (request, response) => {
  const { search_q = "", priority, status, category } = request.query;

  let data = null;
  let getTodosQuery = "";

  //WE ARE USING SWITCH CASES FOR BECAUSE OF DIFFERENT SCENARIOS

  switch (true) {
    //SCENARIO -1 --- HAS ONLY STATUS
    case hasStatusProperty(request.query):
      if (status === "TO DO" || status === "IN PROGRESS" || status === "DONE") {
        getTodosQuery = `
            SELECT * FROM TASKS WHERE status = '${status}';`;

        data = await database.all(getTodosQuery);
        response.send(
          data.map((eachItem) => convertDataIntoResponseObject(eachItem))
        );
      } else {
        response.status(400);
        response.send("Invalid Todo Status");
      }
      break;
    //SCENARIO -2 HAS ONLY PRIORITY

    case hasPriorityProperty(request.query):
      if (priority === "HIGH" || priority === "MEDIUM" || priority === "LOW") {
        getTodosQuery = `
            SELECT * FROM TASKS WHERE priority = '${priority}';`;

        data = await database.all(getTodosQuery);
        response.send(
          data.map((eachItem) => convertDataIntoResponseObject(eachItem))
        );
      } else {
        response.status(400);
        response.send("Invalid Todo Priority");
      }
      break;

    //SCENARIO - 3 HAS BOTH PRIORITY AND STATUS

    case hasPriorityAndStatusProperties(request.query):
      if (priority === "HIGH" || priority === "MEDIUM" || priority === "LOW") {
        if (
          status === "TO DO" ||
          status === "IN PROGRESS" ||
          status === "DONE"
        ) {
          getTodosQuery = `SELECT * FROM TASKS
                   WHERE priority = '${priority}'
                   AND status = '${status}';`;

          data = await database.all(getTodosQuery);
          response.send(
            data.map((eachItem) => convertDataIntoResponseObject(eachItem))
          );
        } else {
          response.status(400);
          response.send("Invalid Todo Status");
        }
      } else {
        response.status(400);
        response.send("Invalid Todo Priority");
      }

      break;

    //SCENARIO - 4 HAS ONLY SEARCH_Q

    case hasSearchProperty(request.query):
      getTodosQuery = `SELECT * FROM TASKS WHERE todo LIKE '%${search_q}%';`;

      data = await database.all(getTodosQuery);
      response.send(
        data.map((eachItem) => convertDataIntoResponseObject(eachItem))
      );

      break;

    // SCENARIO - 5 HAS BOTH CATEGORY AND STATUS

    case hasCategoryAndStatusProperties(request.query):
      if (
        category === "WORK" ||
        category === "HOME" ||
        category === "LEARNING"
      ) {
        if (
          status === "TO DO" ||
          status === "IN PROGRESS" ||
          status === "DONE"
        ) {
          getTodosQuery = `SELECT * FROM TASKS 
            WHERE category = '${category}'
            AND status = '${status}';`;

          data = await database.all(getTodosQuery);
          response.send(
            data.map((eachItem) => convertDataIntoResponseObject(eachItem))
          );
        } else {
          response.status(400);
          response.send("Invalid Todo Status");
        }
      } else {
        response.status(400);
        response.send("Invalid Todo Category");
      }

      break;

    //SCENARIO - 6 HAS ONLY CATEGORY

    case hasCategoryProperty(request.query):
      if (
        category === "WORK" ||
        category === "HOME" ||
        category === "LEARNING"
      ) {
        getTodosQuery = `
            SELECT * FROM TASKS WHERE category = '${category}';`;

        data = await database.all(getTodosQuery);
        response.send(
          data.map((eachItem) => convertDataIntoResponseObject(eachItem))
        );
      } else {
        response.status(400);
        response.send("Invalid Todo Category");
      }
      break;

    //SCENARIO -7 HAS BOTH CATEGORY AND PRIORITY

    case hasCategoryAndPriorityProperties(request.query):
      if (
        category === "WORK" ||
        category === "HOME" ||
        category === "LEARNING"
      ) {
        if (
          priority === "HIGH" ||
          priority === "MEDIUM" ||
          priority === "LOW"
        ) {
          getTodosQuery = `SELECT * FROM TASKS 
            WHERE category = '${category}'
            AND priority = '${priority}';`;

          data = await database.all(getTodosQuery);
          response.send(
            data.map((eachItem) => convertDataIntoResponseObject(eachItem))
          );
        } else {
          response.status(400);
          response.send("Invalid Todo Priority");
        }
      } else {
        response.status(400);
        response.send("Invalid Todo Category");
      }

      break;
    //DEFAULT
    default:
      getTodosQuery = `SELECT * FROM TASKS;`;
      data = await database.all(getTodosQuery);
      response.send(
        data.map((eachItem) => convertDataIntoResponseObject(eachItem))
      );
  }
});

//API -2

app.get(
  "/todo/:taskId/",
  authentication,
  accessVerification,
  async (request, response) => {
    const { taskId } = request.params;
    const getTodosQuery = `SELECT * FROM TASKS 
    WHERE task_id = ${taskId};`;

    const dbResponse = await database.get(getTodosQuery);
    response.send(convertDataIntoResponseObject(dbResponse));
  }
);

//API - 3

app.get("/agenda/", authentication, async (request, response) => {
  const { date } = request.query;

  if (isMatch(date, "yyyy-MM-dd")) {
    const newDate = format(new Date(date), "yyyy-MM-dd");

    const getDateQuery = `SELECT * FROM TASKS WHERE due_date='${newDate}';`;
    const dbResponse = await database.all(getDateQuery);

    if (dbResponse.length !== 0) {
      response.send(
        dbResponse.map((eachItem) => convertDataIntoResponseObject(eachItem))
      );
    } else {
      response.status(400);
      response.send("Due Date is not in Database, please Enter a correct date");
    }
  } else {
    response.status(400);
    response.send("Invalid Due Date");
  }
});

// API -4

app.post("/tasks/", authentication, async (request, response) => {
  const {
    taskId,
    todo,
    priority,
    status,
    category,
    dueDate,
    assigneeId,
  } = request.body;
  //   console.log(typeof dueDate);

  if (priority === "HIGH" || priority === "MEDIUM" || priority === "LOW") {
    if (status === "TO DO" || status === "IN PROGRESS" || status === "DONE") {
      if (
        category === "WORK" ||
        category === "HOME" ||
        category === "LEARNING"
      ) {
        if (isMatch(dueDate, "yyyy-MM-dd")) {
          const newDueDate = format(new Date(dueDate), "yyyy-MM-dd");

          const postQuery = `
                INSERT INTO
                TASKS (task_id, todo, priority, status, category, due_date, assignee_id)
                VALUES
                (${taskId}, '${todo}', '${priority}','${status}', '${category}', '${newDueDate}', ${assigneeId});`;

          await database.run(postQuery);
          response.send("Task Added Successfully");
        } else {
          response.status(400);
          response.send("Invalid Due Date");
        }
      } else {
        response.status(400);
        response.send("Invalid Todo Category");
      }
    } else {
      response.status(400);
      response.send("Invalid Todo Status");
    }
  } else {
    response.status(400);
    response.send("Invalid Todo Priority");
  }
});

//API -5
app.put("/todos/:todoId/", authentication, async (request, response) => {
  const { todoId } = request.params;

  let updateColumn = "";
  const requestBody = request.body;

  const previousTodoQuery = `SELECT * FROM TASKS WHERE task_id =${todoId};`;
  const previousTodo = await database.get(previousTodoQuery);

  const {
    todo = previousTodo.todo,
    priority = previousTodo.priority,
    status = previousTodo.status,
    category = previousTodo.category,
    dueDate = previousTodo.dueDate,
    assigneeId = previousTodo.assigneeId,
  } = request.body;

  let updateTodo;

  //WE ARE USING SWITCH CASE BECAUSE SCENARIOS ARE GIVEN

  switch (true) {
    //UPDATING STATUS
    case requestBody.status !== undefined:
      if (status === "TO DO" || status === "IN PROGRESS" || status === "DONE") {
        updateTodo = `
              UPDATE 
              TASKS
              SET 
                todo='${todo}', 
                priority='${priority}',
                status='${status}',
                category='${category}',
                due_date='${dueDate}',
                assignee_id='${assigneeId}'
              WHERE task_id = ${todoId};`;

        await database.run(updateTodo);
        response.send("Status Updated");
      } else {
        response.status(400);
        response.send("Invalid Todo Status");
      }

      break;

    //UPDATING PRIORITY
    case requestBody.priority !== undefined:
      if (priority === "HIGH" || priority === "MEDIUM" || priority === "LOW") {
        updateTodo = `
              UPDATE 
              TASKS
              SET 
                todo='${todo}', 
                priority='${priority}',
                status='${status}',
                category='${category}',
                due_date='${dueDate}',
                assignee_id='${assigneeId}'
              WHERE task_id = ${todoId};`;

        await database.run(updateTodo);
        response.send("Priority Updated");
      } else {
        response.status(400);
        response.send("Invalid Todo Priority");
      }

      break;

    //UPDATING TODO
    case requestBody.todo !== undefined:
      updateTodo = `
              UPDATE 
              TASKS
              SET 
                todo='${todo}', 
                priority='${priority}',
                status='${status}',
                category='${category}',
                due_date='${dueDate}',
                assignee_id='${assigneeId}'
              WHERE task_id = ${todoId};`;

      await database.run(updateTodo);
      response.send("Todo Updated");

      break;

    //UPDATING CATEGORY
    case requestBody.category !== undefined:
      if (
        category === "WORK" ||
        category === "HOME" ||
        category === "LEARNING"
      ) {
        updateTodo = `
              UPDATE 
              TASKS
              SET 
                todo='${todo}', 
                priority='${priority}',
                status='${status}',
                category='${category}',
                due_date='${dueDate}',
                assignee_id='${assigneeId}'
              WHERE task_id = ${todoId};`;

        await database.run(updateTodo);
        response.send("Category Updated");
      } else {
        response.status(400);
        response.send("Invalid Todo Category");
      }

      break;

    //UPDATING DUE DATE

    case requestBody.dueDate !== undefined:
      if (isMatch(dueDate, "yyyy-MM-dd")) {
        const newDueDate = format(new Date(dueDate), "yyyy-MM-dd");

        updateTodo = `
              UPDATE 
              TASKS
              SET 
                todo='${todo}', 
                priority='${priority}',
                status='${status}',
                category='${category}',
                due_date='${dueDate}',
                assignee_id='${assigneeId}'
              WHERE task_id = ${todoId};`;

        await database.run(updateTodo);
        response.send("Due Date Updated");
      } else {
        response.status(400);
        response.send("Invalid Due Date");
      }

      break;
  }
});

// API -6

app.delete("/todos/:todoId/", authentication, async (request, response) => {
  const { todoId } = request.params;
  const deleteTodoQuery = `
  DELETE FROM
    TASKS
  WHERE
    task_id = ${todoId};`;

  await database.run(deleteTodoQuery);
  response.send("Todo Deleted");
});

module.exports = app;
