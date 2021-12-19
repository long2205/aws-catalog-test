import { Stack, StackProps, CfnParameter } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PolicyDocument, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction  } from 'aws-cdk-lib/aws-events-targets'

export class CdkAutoStartStopCatalogStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // EC2 Resources list
    const ec2_resources = new CfnParameter(this, "ec2_resources", {
      type: "String",
      description: "EC2 Resources to stop, seperate by coma",
      default: ""
    });

    // RDS Resources list
    const rds_resources = new CfnParameter(this, "rds_resources", {
      type: "String",
      description: "RDS Resources to stop, seperate by coma",
      default: ""
    });

    // Create role for lamba
    const custom_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                ],
                "Resource": "arn:aws:logs:*:*:*"
            },
            {
                "Effect": "Allow",
                "Action": [
                    "ec2:Start*",
                    "ec2:Stop*",
                    "rds:DescribeDBInstances",
                    "rds:StopDBInstance",
                    "rds:StartDBInstance"
                ],
                "Resource": "*"
            }
        ]
    };
    const custom_policy_document = PolicyDocument.fromJson(custom_policy);
    const lambda_role = new Role(this,`${this.stackName}-lambda-role`,
    {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: { "custom-lambda-role": custom_policy_document },
    });

    // Lambda for stop/start EC2 and RDS
    const lambda_fn = new Function(this, `${this.stackName}-LambdaFunction`, {
      runtime: Runtime.PYTHON_3_7,
      handler: 'index.handler',
      code: Code.fromBucket(Bucket.fromBucketName(this, 'code-bucket', 'afterfit-auto-start-stop-resources'), 'auto_start_stop.py'),
      role: lambda_role,
      environment: {
        'ec2': ec2_resources.valueAsString,
        'rds': rds_resources.valueAsString
      },
    });

    /**
     * Event invocation
     * Default start time: 0900 Weekday UTC+9 = 0000 Weekday UTC+0
     * Default stop time: 2300 Weekday UTC+9 = 1400 Weekday UTC+0
     */
    const start_events = new Rule(this, 'auto-start', {
      schedule: Schedule.cron({minute: '0', hour: '0', weekDay: '2-6'}),
      targets: [new LambdaFunction(lambda_fn)]
    });

    const stop_events = new Rule(this, 'auto-stop', {
      schedule: Schedule.cron({minute: '0', hour: '14', weekDay: '2-6'}),
      targets: [new LambdaFunction(lambda_fn)]
    });
  }
}
