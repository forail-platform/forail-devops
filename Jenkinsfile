///////////////////////////////////////////////////////////////////////////////
// Forge Platform — CI/CD Pipeline (Jenkins)
//
// This pipeline lives in forge-deploy and orchestrates builds across all
// three repositories: forge-backend, forge-frontend, and forge-deploy.
//
// Stages:  Checkout → Lint → Test → Build → Security → Release
//
// Version is derived from git tag on forge-deploy (v2026.03.0 → 2026.03.0).
// For non-tag builds, commit SHA is used.
//
// Jenkins credentials required:
//   - forge-git-creds:      SSH key for git.cloudforyour.work
//   - forge-dockerhub-creds: DockerHub username/password (krlex)
///////////////////////////////////////////////////////////////////////////////

pipeline {
    agent any

    environment {
        PYTHON_VERSION   = '3.12'
        NODE_VERSION     = '20'
        DOCKER_BUILDKIT  = '1'

        // Git repositories
        BACKEND_REPO     = 'git@git.cloudforyour.work:forge-platform/forge-backend.git'
        FRONTEND_REPO    = 'git@git.cloudforyour.work:forge-platform/forge-frontend.git'
        GIT_BRANCH_NAME  = "${env.BRANCH_NAME ?: 'main'}"

        // Docker images
        BACKEND_IMAGE    = 'krlex/forge-backend'
        FRONTEND_IMAGE   = 'krlex/forge-frontend'

        // Version from git tag or commit SHA
        GIT_TAG          = sh(script: 'git describe --tags --exact-match 2>/dev/null || echo ""', returnStdout: true).trim()
        VERSION          = sh(script: '''
            TAG=$(git describe --tags --exact-match 2>/dev/null || echo "")
            if [ -n "$TAG" ]; then
                echo "$TAG" | sed 's/^v//'
            else
                git rev-parse --short HEAD
            fi
        ''', returnStdout: true).trim()
        IS_TAG_BUILD     = sh(script: 'git describe --tags --exact-match 2>/dev/null && echo true || echo false', returnStdout: true).trim()
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timestamps()
        timeout(time: 60, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {
        // ─── Info ──────────────────────────────────────────────────────
        stage('Info') {
            steps {
                echo "Version: ${VERSION}"
                echo "Tag build: ${IS_TAG_BUILD}"
                echo "Branch: ${GIT_BRANCH_NAME}"
            }
        }

        // ─── Checkout ──────────────────────────────────────────────────
        // Clone backend and frontend repos alongside forge-deploy
        stage('Checkout') {
            parallel {
                stage('Checkout Backend') {
                    steps {
                        dir('forge-backend') {
                            git branch: "${GIT_BRANCH_NAME}",
                                credentialsId: 'forge-git-creds',
                                url: "${BACKEND_REPO}"
                        }
                    }
                }
                stage('Checkout Frontend') {
                    steps {
                        dir('forge-frontend') {
                            git branch: "${GIT_BRANCH_NAME}",
                                credentialsId: 'forge-git-creds',
                                url: "${FRONTEND_REPO}"
                        }
                    }
                }
            }
        }

        // ─── Lint ──────────────────────────────────────────────────────
        stage('Lint') {
            parallel {
                stage('Python Lint') {
                    agent {
                        docker {
                            image "python:${PYTHON_VERSION}-slim"
                            args '--user root'
                        }
                    }
                    steps {
                        dir('forge-backend') {
                            sh '''
                                pip install --no-cache-dir -q flake8
                                echo "=== Flake8 (Python lint) ==="
                                flake8 forge/ --count --statistics
                            '''
                        }
                    }
                }
                stage('Frontend Lint') {
                    agent {
                        docker {
                            image "node:${NODE_VERSION}-slim"
                            args '--user root'
                        }
                    }
                    steps {
                        dir('forge-frontend') {
                            sh '''
                                npm ci --prefer-offline
                                echo "=== TypeScript check ==="
                                npx tsc --noEmit
                            '''
                        }
                    }
                }
            }
        }

        // ─── Test ──────────────────────────────────────────────────────
        stage('Test') {
            parallel {
                stage('Python Unit Tests') {
                    agent {
                        docker {
                            image "python:${PYTHON_VERSION}-slim"
                            args '--user root'
                        }
                    }
                    steps {
                        dir('forge-backend') {
                            sh '''
                                apt-get update -qq && apt-get install -y -qq \
                                    git libpq-dev libldap2-dev libsasl2-dev \
                                    libxmlsec1-dev pkg-config gcc
                                pip install --no-cache-dir \
                                    -r requirements/requirements.txt \
                                    -r requirements/requirements_dev.txt
                                pip install --no-cache-dir -e .

                                echo "=== Python unit tests ==="
                                python -m pytest forge/main/tests/unit/ -x -q --tb=short
                            '''
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: '**/junit-*.xml'
                        }
                    }
                }
                stage('Frontend Unit Tests') {
                    agent {
                        docker {
                            image "node:${NODE_VERSION}-slim"
                            args '--user root'
                        }
                    }
                    steps {
                        dir('forge-frontend') {
                            sh '''
                                npm ci --prefer-offline
                                echo "=== Frontend unit tests (Vitest) ==="
                                npx vitest run
                            '''
                        }
                    }
                }
            }
        }

        // ─── Build ─────────────────────────────────────────────────────
        stage('Build') {
            when {
                anyOf {
                    branch 'main'
                    branch 'devel'
                    buildingTag()
                }
            }
            parallel {
                stage('Build Backend Image') {
                    steps {
                        dir('forge-backend') {
                            sh """
                                echo "=== Building backend image (${VERSION}) ==="
                                docker build \
                                    --build-arg VERSION=${VERSION} \
                                    --build-arg SETUPTOOLS_SCM_PRETEND_VERSION=${VERSION} \
                                    -t ${BACKEND_IMAGE}:${VERSION} \
                                    -t ${BACKEND_IMAGE}:latest \
                                    .
                            """
                        }
                    }
                }
                stage('Build Frontend Image') {
                    steps {
                        dir('forge-frontend') {
                            sh """
                                echo "=== Building frontend image (${VERSION}) ==="
                                docker build \
                                    -t ${FRONTEND_IMAGE}:${VERSION} \
                                    -t ${FRONTEND_IMAGE}:latest \
                                    .
                            """
                        }
                    }
                }
            }
        }

        // ─── Security ──────────────────────────────────────────────────
        stage('Security') {
            when {
                anyOf {
                    branch 'main'
                    branch 'devel'
                    buildingTag()
                }
            }
            parallel {
                stage('pip-audit') {
                    agent {
                        docker {
                            image "python:${PYTHON_VERSION}-slim"
                            args '--user root'
                        }
                    }
                    steps {
                        dir('forge-backend') {
                            sh '''
                                pip install --no-cache-dir -q pip-audit
                                echo "=== pip-audit (Python CVE scan) ==="
                                pip-audit -r requirements/requirements.txt --desc || true
                            '''
                        }
                    }
                }
                stage('Trivy Backend') {
                    steps {
                        sh """
                            echo "=== Trivy scan: backend ==="
                            docker run --rm \
                                -v /var/run/docker.sock:/var/run/docker.sock \
                                aquasec/trivy:latest image \
                                --exit-code 0 \
                                --severity CRITICAL \
                                ${BACKEND_IMAGE}:latest || true
                        """
                    }
                }
                stage('Trivy Frontend') {
                    steps {
                        sh """
                            echo "=== Trivy scan: frontend ==="
                            docker run --rm \
                                -v /var/run/docker.sock:/var/run/docker.sock \
                                aquasec/trivy:latest image \
                                --exit-code 0 \
                                --severity CRITICAL \
                                ${FRONTEND_IMAGE}:latest || true
                        """
                    }
                }
            }
        }

        // ─── Release ───────────────────────────────────────────────────
        // Push images to DockerHub. Runs on main branch or git tags.
        stage('Release') {
            when {
                anyOf {
                    branch 'main'
                    buildingTag()
                }
            }
            steps {
                script {
                    echo "=== Releasing Forge ${VERSION} ==="
                    withCredentials([usernamePassword(
                        credentialsId: 'forge-dockerhub-creds',
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
                    )]) {
                        sh '''
                            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
                        '''
                    }

                    sh """
                        # Push backend
                        docker push ${BACKEND_IMAGE}:${VERSION}
                        docker push ${BACKEND_IMAGE}:latest

                        # Push frontend
                        docker push ${FRONTEND_IMAGE}:${VERSION}
                        docker push ${FRONTEND_IMAGE}:latest
                    """

                    // If tag build, also push version-specific tags
                    if (env.IS_TAG_BUILD == 'true') {
                        echo "Tag build — pushed ${VERSION} and latest"
                    }
                }
            }
        }
    }

    post {
        success {
            echo "Pipeline completed — Forge ${VERSION}"
        }
        failure {
            echo "Pipeline FAILED — Forge ${VERSION}"
        }
        cleanup {
            sh """
                docker rmi ${BACKEND_IMAGE}:${VERSION} ${BACKEND_IMAGE}:latest 2>/dev/null || true
                docker rmi ${FRONTEND_IMAGE}:${VERSION} ${FRONTEND_IMAGE}:latest 2>/dev/null || true
                docker logout 2>/dev/null || true
            """
        }
    }
}
